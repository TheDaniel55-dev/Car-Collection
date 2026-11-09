# Plan de testare (pe iPhone, Safari → Adaugă pe ecranul principal)

Automat (rulează în `npm test` și `npm run smoke`): chei de traducere EN/RO, parser pe fixture sintetic, verdicte dubluri, raritate, criptare, căutare, adăugare manuală, boot în jsdom.
**Nu a fost testat într-un browser real** — de aceea lista de mai jos e obligatorie înainte de a te baza pe aplicație.

## 1. Instalare și offline
1. Deschide adresa în Safari, cu internet. Așteaptă „Instalez baza de date…" până dispare.
2. Partajare → Adaugă pe ecranul principal. Deschide din iconiță.
3. Pornește Modul avion. Închide complet aplicația și redeschide-o. ✔ pornește, colecția se vede.
4. Offline: Adaugă → scrie un nume inexistent → „Nu e în listă? Adaug-o manual" → salvează. ✔ apare în colecție și în căutare.
5. Offline: Adaugă → Scanează baza (poză cu partea de jos a unei mașini). ✔ citește codul sau cere scrierea manuală, fără blocare.

## 2. Actualizare bază de date
1. Rulează Actions → Refresh database (sau așteaptă luna viitoare). Deschide aplicația online.
2. Setări → Baza de date → „Caută actualizări". ✔ progres %, apoi „Baza de date actualizată: +N lansări noi" (doar shard-urile schimbate se descarcă).
3. Repetă imediat. ✔ „Baza de date e la zi".
4. Fii offline și apasă Caută actualizări. ✔ mesaj offline, aplicația rămâne folosibilă.

## 3. Backup și restaurare
1. Setări → Copie criptată (parolă ≥ 8). Salvează fișierul în Fișiere/iCloud.
2. Setări → Șterge colecția. ✔ goală.
3. Importă fișierul, parola corectă. ✔ revin toate mașinile. Parola greșită → mesaj, nimic șters.
4. Importă un export vechi din prototip. ✔ exemplele „ex" sunt sărite, restul importate.
5. Export CSV se deschide în Numbers/Excel.

## 4. Profile și PIN
1. Profil nou → colecție separată. Comută între profile. ✔ nu se amestecă.
2. Setează PIN, închide aplicația. ✔ cere PIN la deschidere.

## 5. Verificări vizuale
Cele 4 teme × luminos/întunecat/sistem; „Reduce motion" activat în iOS → fără animații; text mare (Dynamic Type) → fără tăieturi; rotire ecran.
