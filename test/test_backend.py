import asyncio
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import BackgroundTasks, HTTPException
from starlette.requests import Request

import backend.app as api
import gesture_detection


def make_request(body, content_type="image/jpeg"):
    received = False

    async def receive():
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/camera/frame",
        "raw_path": b"/api/camera/frame",
        "query_string": b"",
        "headers": [(b"content-type", content_type.encode())],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
    }
    return Request(scope, receive)


class GestureRulesTests(unittest.TestCase):
    def setUp(self):
        self.hand = SimpleNamespace(landmark=[])

    def test_two_fingers_are_perdido(self):
        with (
            patch.object(gesture_detection, "dedos_levantados", return_value=[True, True, False, False]),
            patch.object(gesture_detection, "_distancia", side_effect=[2.0, 1.0]),
        ):
            self.assertEqual(gesture_detection.reconhecer_gesto(self.hand), "PERDIDO")

    def test_closed_hand_is_acidente(self):
        with (
            patch.object(gesture_detection, "dedos_levantados", return_value=[False] * 4),
            patch.object(gesture_detection, "_distancia", side_effect=[0.5, 1.0]),
        ):
            self.assertEqual(gesture_detection.reconhecer_gesto(self.hand), "ACIDENTE")

    def test_open_hand_is_sequestro(self):
        with (
            patch.object(gesture_detection, "dedos_levantados", return_value=[True] * 4),
            patch.object(gesture_detection, "_distancia", side_effect=[2.0, 1.0]),
        ):
            self.assertEqual(gesture_detection.reconhecer_gesto(self.hand), "SEQUESTRO")


class GestureConfirmationTests(unittest.TestCase):
    def test_confirmation_and_cooldown_thresholds(self):
        tracker = api.GestureConfirmation()
        self.assertFalse(tracker.observe("PERDIDO", 100.0))
        self.assertFalse(tracker.observe("PERDIDO", 101.499))
        self.assertTrue(tracker.observe("PERDIDO", 101.5))
        self.assertFalse(tracker.observe("PERDIDO", 101.6))

        self.assertFalse(tracker.observe(None, 102.0))
        self.assertFalse(tracker.observe("ACIDENTE", 103.0))
        self.assertFalse(tracker.observe("ACIDENTE", 104.5))
        self.assertFalse(tracker.observe("ACIDENTE", 111.499))
        self.assertTrue(tracker.observe("ACIDENTE", 111.5))


class CameraApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ok, image = cv2.imencode(".jpg", np.zeros((80, 120, 3), dtype=np.uint8))
        if not ok:
            raise RuntimeError("Could not encode the camera test JPEG")
        cls.jpeg = image.tobytes()

    def setUp(self):
        api.camera_token = "test-camera-token"
        api.recent_gestures.clear()
        api.gesture_confirmation = api.GestureConfirmation()
        api.last_frame_received_at = None
        api.last_frame_jpeg = None
        api.last_stream_jpeg = None
        api.last_frame_sequence = 0
        with api.camera_frame_queue_lock:
            api.pending_camera_frame = None
            api.camera_frame_worker_active = False

    def test_frame_requires_bearer_token(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                api.receive_camera_frame(
                    make_request(self.jpeg), BackgroundTasks(), authorization=None
                )
            )
        self.assertEqual(error.exception.status_code, 401)

    def test_valid_jpeg_updates_camera_status(self):
        background_tasks = BackgroundTasks()
        with patch.object(
            api.hands,
            "process",
            return_value=SimpleNamespace(multi_hand_landmarks=None),
        ) as process_mock:
            result = asyncio.run(
                api.receive_camera_frame(
                    make_request(self.jpeg),
                    background_tasks,
                    authorization="Bearer test-camera-token",
                )
            )
            process_mock.assert_not_called()
            self.assertTrue(result["received"])
            self.assertEqual(result["processing"], "queued")
            self.assertTrue(api.camera_status()["connected"])
            self.assertEqual(api.latest_camera_frame().body, self.jpeg)
            self.assertEqual(api.last_stream_jpeg, self.jpeg)
            self.assertEqual(api.last_frame_sequence, 1)
            asyncio.run(background_tasks())
            process_mock.assert_called_once()
            self.assertNotEqual(api.last_stream_jpeg, self.jpeg)
            self.assertEqual(api.last_frame_sequence, 2)

    def test_busy_worker_keeps_only_the_latest_pending_frame(self):
        api.camera_frame_worker_active = True
        ok, image = cv2.imencode(
            ".jpg", np.full((80, 120, 3), 255, dtype=np.uint8)
        )
        self.assertTrue(ok)
        newest_jpeg = image.tobytes()

        for jpeg in (self.jpeg, newest_jpeg):
            asyncio.run(
                api.receive_camera_frame(
                    make_request(jpeg),
                    BackgroundTasks(),
                    authorization="Bearer test-camera-token",
                )
            )

        self.assertEqual(api.pending_camera_frame[0], newest_jpeg)
        self.assertEqual(api.last_stream_jpeg, newest_jpeg)
        self.assertEqual(api.last_frame_sequence, 2)

    def test_camera_stream_yields_mjpeg_frames(self):
        api.last_stream_jpeg = self.jpeg
        api.last_frame_sequence = 1

        async def first_chunk():
            stream = api.stream_camera_frames()
            chunk = await stream.__anext__()
            await stream.aclose()
            return chunk

        chunk = asyncio.run(first_chunk())

        self.assertTrue(chunk.startswith(b"--frame\r\n"))
        self.assertIn(b"Content-Type: image/jpeg\r\n", chunk)
        self.assertTrue(chunk.endswith(self.jpeg + b"\r\n"))

    def test_latest_frame_returns_jpeg_and_server_timestamp(self):
        timestamp = datetime.now(timezone.utc)
        api.last_frame_jpeg = self.jpeg
        api.last_frame_received_at = timestamp

        response = api.latest_camera_frame()

        self.assertEqual(response.body, self.jpeg)
        self.assertEqual(response.media_type, "image/jpeg")
        self.assertEqual(response.headers["X-Frame-Received-At"], timestamp.isoformat())
        self.assertEqual(
            response.headers["Cache-Control"], "no-store, no-cache, must-revalidate"
        )

    def test_latest_frame_returns_404_before_first_image(self):
        with self.assertRaises(HTTPException) as error:
            api.latest_camera_frame()
        self.assertEqual(error.exception.status_code, 404)

    def test_invalid_jpeg_is_rejected(self):
        for invalid_jpeg in (b"not-a-jpeg", b"\xff\xd8truncated"):
            with self.subTest(invalid_jpeg=invalid_jpeg), self.assertRaises(
                HTTPException
            ) as error:
                asyncio.run(
                    api.receive_camera_frame(
                        make_request(invalid_jpeg),
                        BackgroundTasks(),
                        authorization="Bearer test-camera-token",
                    )
                )
            self.assertEqual(error.exception.status_code, 400)

    def test_oversized_frame_is_rejected(self):
        body = b"x" * (api.MAX_FRAME_BYTES + 1)
        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                api.receive_camera_frame(
                    make_request(body),
                    BackgroundTasks(),
                    authorization="Bearer test-camera-token",
                )
            )
        self.assertEqual(error.exception.status_code, 413)
