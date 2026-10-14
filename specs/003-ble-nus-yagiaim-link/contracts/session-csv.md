# Contrato: exportación CSV de sesión

RFC 4180, UTF-8, separador `,`, punto decimal `.`, una fila por **muestra**. Nombre de archivo: `yagiaim_<repetidor>_<yyyyMMdd-HHmmss>.csv`.

## Cabecera (orden fijo)

```
session_id,repeater_name,repeater_hash,repeater_lat,repeater_lon,reading_idx,sample_idx,t_tx_iso,t_rx_iso,lat,lon,alt_m,h_acc_m,target_bearing_deg,heading_tx_deg,heading_rx_deg,heading_acc_deg,delta_deg,unstable,seq,tag,status,rtt_ms,snr_up_db,snr_dn_db,rssi_dn_dbm,n_resp,txp_dbm,fw,proto
```

| Columna | Formato |
|---|---|
| t_*_iso | ISO 8601 con milisegundos y offset (`2026-10-15T07:12:03.215-05:00`) |
| *_deg | 1 decimal; `delta_deg` en (−180, 180] |
| unstable | `0`/`1` |
| snr_*, rssi | igual que en la línea `P,` (vacío si timeout) |
| repeater_hash | 2 hex |

Una fila por muestra (no por lectura): los resúmenes se recalculan en el análisis. Esto mantiene el CSV simple y sin pérdida de información.
