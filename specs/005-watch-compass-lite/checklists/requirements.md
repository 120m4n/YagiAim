# Specification Quality Checklist: Brújula lite en Apple Watch Series 3

**Created**: 2026-10-15 · **Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Centrada en el caso de uso (girar la Yagi en la torre sin mirar el teléfono)
- [x] Secciones obligatorias completas
- [x] Restricciones del hardware verificadas con fuentes (sin magnetómetro, watchOS 8.8.1, Xcode 26, emparejamiento)

## Requirement Completeness

- [x] Sin [NEEDS CLARIFICATION]; 6 decisiones asumidas y registradas (D-1…D-6), reversibles antes de implementar
- [x] Cada requisito de pantalla cita su origen en la app iOS (archivo y línea)
- [x] Criterios medibles SC-001…SC-006
- [x] Casos borde (muñeca abajo, orden de mensajes, datos viejos, app iOS cerrada)
- [x] Alcance "lite" delimitado (fuera: pinger, mapa, sesiones, Digital Crown, complicaciones)

## Feature Readiness

- [x] FR → tareas (tabla en tasks.md)
- [x] Impacto en la app iOS acotado (FR-007, SC-006) y en el port Android anotado (no aplica)
