# Quickstart: 002 Verificación en host

```bash
cd /Users/120m4n/GitHub/Meshcore

# Toda la suite (unitarios de la 001 + interoperabilidad)
./examples/trace_pinger/run_tests.sh

# Solo algunas suites
./examples/trace_pinger/run_tests.sh test_interop_packet test_repeater_model

# Guardián de deriva
python3 examples/trace_pinger/tools/check_upstream_trace.py            # 0 = sin deriva
python3 examples/trace_pinger/tools/check_upstream_trace.py --update   # tras revisar un cambio
```

## Añadir una captura de campo

1. Con el pinger en `raw=1` (o `MON on`), copia la línea `R,<t>,<rssi>,<snr>,<HEX>`.
2. Añade a `examples/trace_pinger/tests/fixtures/frames/field-<fecha>.txt`:
   ```
   <HEX>	{"kind":"echo","tag":"…","hash":"4F","snr_up_q":-25}
   ```
3. `./examples/trace_pinger/run_tests.sh test_field_frames`

## Traer cambios de upstream

Ver `contracts/upstream-watch.md`, sección "Procedimiento de actualización".
