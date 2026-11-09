# Data format

`data/manifest.json`: `{ version, built, total, shards:[{y,file,hash,size,n}], source:{name,url,license,licenseUrl}, seed }`
`data/y{YYYY}.json`: `{ y, rows:[[id,name,toy,col,ser,y,ty,num,base,tp,wh,cy], ...] }`

| Field | Meaning |
|---|---|
| id | unique variant id (stable across rebuilds if possible) |
| name | casting name |
| toy | toy / card code (e.g. HLH72) |
| col | colour as written on the wiki |
| ser | series name |
| y | release year (shard key; `0` = unknown, used by starter data) |
| ty | type: m, ex, p, th, cv, rlc, sth, er |
| num | number in series / mainline number |
| base | casting code on the car's underside (often empty: wiki lists toy numbers; the app learns base codes when you add cars) |
| tp, wh | tampo/deco, wheels |
| cy | casting year (©) |

The app downloads `manifest.json` (network-first), compares each shard `hash` with what is installed, and downloads only changed shards as `data/yYYYY.json?h=<hash>`.
`seed: true` means the starter examples only; run **Actions → Refresh database** once to fetch the real catalogue.
