# Car collection

Aplicație web instalabilă (PWA), care merge **și fără internet**, pentru colecția ta de mașinuțe die-cast (Hot Wheels).
Colecția ta rămâne **doar pe telefonul tău** (nu există server, nu există cont online).

## Ce știe să facă
- Adaugi mașini după cod (baza mașinii / cardul), după **poză cu baza/cardul (OCR pe telefon)**, după **poza mașinii (culoarea se detectează)** sau **manual**, inclusiv **fără internet** când nu o găsește în bază.
- Verdict la magazin: **O AI DEJA / VERIFICĂ / CUMPĂR** + Modul magazin (ecran mare).
- Serii: inele de progres, ce îți lipsește, cele mai apropiate de final.
- Raritate estimată 1–100 cu explicație („cum se calculează").
- Profile locale (fiecare cu colecția lui separată), PIN opțional, 4 teme × luminos/întunecat/sistem, EN + RO.
- Copie de siguranță **criptată** (AES-GCM) + export CSV, import din prototipul vechi.
- Baza de date (Hot Wheels 1968 → azi) se actualizează lunar printr-un robot GitHub, iar aplicația descarcă doar ce s-a schimbat.

## Instalare pas cu pas (fără programare)

Ai nevoie de un cont GitHub (gratuit) și de un **calculator** pentru încărcare (de pe iPhone nu merge bine încărcarea de foldere ascunse).

1. **Creează repo-ul.** GitHub → `+` → *New repository*. Nume: `car-collection`. Alege **Public** (vezi nota despre privat mai jos). Nu bifa „Add README".
2. **Încarcă fișierele.** Dezarhivează `car-collection-source.zip`. În repo apasă *uploading an existing file* și trage **tot conținutul folderului** (inclusiv folderul ascuns `.github` — pe Mac apasă `Cmd+Shift+.` ca să-l vezi; pe Windows activează *Hidden items*). Apasă *Commit changes*.
3. **Pornește publicarea.** Repo → *Settings* → *Pages* → la **Source** alege **GitHub Actions**.
4. **Primul deploy.** Repo → *Actions* → *Deploy site* → *Run workflow*. După 2–3 minute apare adresa site-ului în *Settings → Pages* (de forma `https://NUME.github.io/car-collection/`).
5. **Adu baza de date reală.** *Actions* → *Refresh database* → *Run workflow*. Durează câteva zeci de minute (1 cerere pe secundă, ca să nu încărcăm wiki-ul). La final se republică site-ul singur. **Până atunci aplicația conține doar 6 exemple de pornire.**
   - Dacă pasul eșuează cu „HEALTH CHECK FAILED", înseamnă că structura wiki-ului nu se potrivește cu parserul — aplicația rămâne neschimbată, nu se publică date greșite. Trimite-mi textul din log.
6. **Pe iPhone:** deschide adresa în **Safari** → Partajare → *Adaugă pe ecranul principal*. Deschide o dată cu internet ca să se instaleze baza de date, apoi merge și offline.

Actualizări de date: automat lunar (ziua 3). Manual: *Actions → Refresh database*.

## Ce nu poți face (și de ce)
- **GitHub Pages din repo privat** cere plan plătit. Pe planul gratuit repo-ul trebuie să fie public.
- **Codul unei aplicații web nu poate fi ascuns complet.** Site-ul publicat este minificat și obfuscat (nume ilizibile, texte codificate, flux de control încâlcit), ceea ce îl face mult mai greu de copiat, **dar nu imposibil**. Repo-ul public conține însă codul sursă *citibil*. Ca să-l protejezi cu adevărat vezi Varianta B.
- Datele din catalog vin de pe wiki (licență CC BY-SA): trebuie să rămână deschise și cu atribuire; nu sunt protejabile.

## Varianta B — sursa rămâne privată (recomandat dacă vrei protecție)
Ai două repo-uri: unul **privat** (sursa, acest proiect) și unul **public** `car-collection-site` (doar site-ul compilat și obfuscat, cu Pages pornit din *Deploy from a branch → main → / (root)*).
1. Creează repo-ul public gol `car-collection-site` și activează Pages pe branch.
2. Creează un *fine-grained personal access token* cu *Contents: Read and write* doar pe `car-collection-site`.
3. În repo-ul privat: *Settings → Secrets and variables → Actions*: secret `SITE_TOKEN` = tokenul; variabilă `SITE_REPO` = `NUMELE-TAU/car-collection-site`.
4. Rulează *Publish to public site repo*. (Actualizarea datelor din *Refresh database* funcționează în repo-ul privat; după ea rulează din nou *Publish*.)
Alternativ, `car-collection-site.zip` conține site-ul deja compilat: îl încarci direct în repo-ul public (fără robot de actualizare a datelor).

## Pentru dezvoltatori
```
npm ci
npm run dev        # server local
npm test           # i18n + parser + logică
npm run smoke      # pornește bundle-ul în jsdom
npm run build      # dist/ (minificat + obfuscat; NO_OBFUSCATE=1 pentru debug)
npm run data       # reface data/ de pe wiki (1 cerere/s, cu progres, ETA și health check)
```
Structura datelor: `docs/DATA-FORMAT.md`. Confidențialitate: `docs/PRIVACY.md`. Plan de testare pe iPhone: `docs/TEST-PLAN.md`. Licențe: `LICENSE`, `THIRD-PARTY.md`.

## Mențiuni legale
Hot Wheels este marcă a Mattel, Inc.; aplicația este neoficială. Numele „Car collection" și iconița sunt generice/proprii (nu folosesc sigla Hot Wheels). Verifică licența exactă a wiki-ului și termenii Fandom înainte de a distribui public datele.
