# Specification Quality Checklist: orientar con baliza

**Created**: 2026-11-06 · **Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Centrada en el flujo de campo: montar un enlace punto a punto nuevo, orientar (no medir)
- [x] Separa con claridad qué es (baliza para enlaces propios) y qué no (repetidores ajenos, comparar antenas)
- [x] Secciones obligatorias completas

## Requirement Completeness

- [x] Sin [NEEDS CLARIFICATION]
- [x] Escenarios por historia y casos borde (baliza apagada, reflexión, cuerpo, brújula, reinicio del pinger, busy)
- [x] Criterios medibles SC-001…SC-005, con dos verificables sin hardware (SC-003, SC-005)
- [x] Contratos: línea `M` (fuente: firmware 0.5.1 y su fixture) y CSV del barrido

## No degradación

- [x] FR-001…FR-003: TRACE `proto=1`, JSON de repetidores, sin dependencias nuevas
- [x] Regla en tasks.md: no se modifica ningún test existente; línea base en T001 y comparación en T060
- [x] Los fixtures `proto=1` y `tools/sync_fixtures.sh` no se tocan; el de la línea `M` va aparte
- [x] Prueba manual con `YagiPinger` en la verificación (T062)

## Feature Readiness

- [x] FR → tareas (tabla en tasks.md)
- [x] Listo para que un agente empiece por la Fase 1 (iOS). Android fuera de alcance
