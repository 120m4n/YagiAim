# Contrato: CSV de un barrido de baliza (US5)

Mismas convenciones que `specs/003-…/contracts/session-csv.md`: RFC 4180, UTF-8, `,` y decimal `.`, ISO 8601 con ms y offset, filas terminadas en `\r\n`. **Es un archivo nuevo**: el CSV de sesiones TRACE no cambia.

Nombre: `meshazimuth_baliza_<punto>_<yyyyMMdd-HHmmss>.csv`.

```
sweep_id,kind,t_iso,point,lat,lon,map_bearing_deg,beacon_freq_mhz,floor_dbm,heading_deg,heading_acc_deg,pitch_deg,level_dbm,sd_db,n,kept,valid,center_deg,left_deg,right_deg,beamwidth_deg,peak_dbm,fw
```

- `kind`: `R` (una lectura) o `B` (la estimación de la bisección, una fila al final si la hubo).
- En las filas `R` quedan vacías `center_deg … peak_dbm`. En la fila `B` quedan vacías `heading_deg … valid`.
- `valid`: `1` o `0` (`kept < 0,8·n`, nivel < piso + 10 dB o brújula peor que ±15°).
- `map_bearing_deg`: el azimut del mapa al punto, para comparar con `center_deg`.
