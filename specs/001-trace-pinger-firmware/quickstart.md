# Quickstart: 001 Pinger TRACE

## Requisitos

- XIAO nRF52840 + Wio-SX1262 con antena 915 MHz (omni para esta fase).
- PlatformIO Core ≥ 6.1, Python 3.10+, `pyserial`.
- Hash del repetidor objetivo: primer byte de su clave pública. Aparece en la app MeshCore (contacto del repetidor → *public key*, los dos primeros dígitos hex) o en un advert capturado con `MON on`.

## Compilar y flashear

```bash
export MESHCORE_DIR=/Users/120m4n/GitHub/Meshcore
cd firmware/pinger
pio test -e native                 # tests de tracecore
pio run -e xiao_nrf52 -t upload    # doble reset → UF2, o upload por serie
pio device monitor -b 115200
```

## Primer ping

```
> HELLO
#HELLO fw=0.1.0 proto=1 radio=SX1262 id=C3F01A
> CFG?
#CFG freq=915.800 bw=250 sf=10 cr=5 txp=22 hash= rate=1500 timeout=auto raw=0
> SET hash=A1
#OK hash=A1
> PING
P,1,5E2A9C01,ok,388,-2.25,-1.50,-104.0,1
> PING 5
P,2,…
…
S,5,5,0,-2.50,-1.75,-104.5
```

## Si todo da `timeout`

1. `MON on` y espera un advert del repetidor. Si no aparece ninguno, revisa freq/bw/sf/cr (915.8/250/10/5) y que la antena esté conectada.
2. Confirma `hash`: el advert trae la pubkey completa en el payload, en los bytes 0–31 tras el header y el path.
3. Confirma que `txp=22` (`CFG?`) y que la antena está bien conectada.
4. Si con `MON` ves tu propio eco pero `P,` dice timeout: es un bug de filtro. Captura con `raw=1` y abre un issue con la línea `R,`.

## Validación de esta fase (SC-001…SC-005)

```bash
python tools/pinger_cli.py --port /dev/cu.usbmodem* --burst 20 --repeat 5 --csv bench.csv
```

El script imprime el % de `ok` (SC-001), el p95 de latencia (SC-002), la duración de la ráfaga (SC-003) y el rango de medianas entre repeticiones (SC-004). Para SC-005 deja un segundo XIAO con `MON on` durante 1 h y verifica que todas las líneas `R,` con origen el pinger empiecen por `2600`.
