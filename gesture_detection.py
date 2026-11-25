import math


GESTO_PERDIDO = "PERDIDO"
GESTO_ACIDENTE = "ACIDENTE"
GESTO_SEQUESTRO = "SEQUESTRO"


def _distancia(pontos, ponto1, ponto2):
    a = pontos[ponto1]
    b = pontos[ponto2]
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def _angulo_articulacao(pontos, ponto1, articulacao, ponto2):
    a = pontos[ponto1]
    b = pontos[articulacao]
    c = pontos[ponto2]
    vetor1 = (a.x - b.x, a.y - b.y, a.z - b.z)
    vetor2 = (c.x - b.x, c.y - b.y, c.z - b.z)
    produto = sum(x * y for x, y in zip(vetor1, vetor2))
    norma1 = math.sqrt(sum(x * x for x in vetor1))
    norma2 = math.sqrt(sum(x * x for x in vetor2))
    if norma1 == 0 or norma2 == 0:
        return 0.0
    cosseno = max(-1.0, min(1.0, produto / (norma1 * norma2)))
    return math.degrees(math.acos(cosseno))


def dedos_levantados(hand):
    pontos = hand.landmark
    dedos = [(5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20)]
    return [
        _angulo_articulacao(pontos, mcp, pip, ponta) >= 140
        and _distancia(pontos, ponta, 0) > _distancia(pontos, pip, 0) * 1.02
        for mcp, pip, ponta in dedos
    ]


def reconhecer_gesto(hand):
    pontos = hand.landmark
    indicador, medio, anelar, mindinho = dedos_levantados(hand)
    polegar_aberto = _distancia(pontos, 4, 5) > _distancia(pontos, 2, 5) * 1.15

    if indicador and medio and anelar and mindinho and polegar_aberto:
        return GESTO_SEQUESTRO
    if indicador and medio and not anelar and not mindinho:
        return GESTO_PERDIDO
    if not any((indicador, medio, anelar, mindinho)):
        return GESTO_ACIDENTE
    return None
