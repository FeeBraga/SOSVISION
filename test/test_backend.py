import asyncio
import unittest
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

    def test_frame_requires_bearer_token(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                api.receive_camera_frame(
                    make_request(self.jpeg), BackgroundTasks(), authorization=None
                )
            )
        self.assertEqual(error.exception.status_code, 401)

    def test_valid_jpeg_updates_camera_status(self):
        with patch.object(api.hands, "process", return_value=SimpleNamespace(multi_hand_landmarks=None)):
            result = asyncio.run(
                api.receive_camera_frame(
                    make_request(self.jpeg),
                    BackgroundTasks(),
                    authorization="Bearer test-camera-token",
                )
            )
        self.assertTrue(result["received"])
        self.assertTrue(api.camera_status()["connected"])

    def test_invalid_jpeg_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(
                api.receive_camera_frame(
                    make_request(b"not-a-jpeg"),
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
