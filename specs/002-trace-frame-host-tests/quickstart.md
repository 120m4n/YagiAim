# Quickstart: 002 Verificación en host

```bash
git submodule update --init third_party/MeshCore
cd firmware/pinger

# Toda la suite (unitarios de la 001 + interoperabilidad)
pio test -e native

# Solo interoperabilidad
pio test -e native -f test_interop_packet -f test_repeater_model

# Guardián de deriva
python3 tools/check_upstream_trace.py            # 0 = sin deriva
python3 tools/check_upstream_trace.py --update   # tras revisar un bump
```

## Añadir una captura de campo

1. Con el pinger en `raw=1` (o `MON on`), copia la línea `R,<t>,<rssi>,<snr>,<HEX>`.
2. Añade a `test/fixtures/frames/field-<fecha>.txt`:
   ```
   <HEX>	{"kind":"echo","tag":"…","hash":"A1","snr_up_q":-25}
   ```
3. `pio test -e native -f test_field_frames`

## Subir el submódulo de MeshCore

Ver `contracts/upstream-watch.md`, sección "Procedimiento de actualización".
