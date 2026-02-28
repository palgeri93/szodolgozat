# English Vocab Trainer (Excel → GitHub Pages)

Ez a verzió **online szódolgozat + tanári export** módot is tud:
- Tanár belép jelszóval, beállítja a dolgozat paramétereit és ad egy **tanulói kódot**.
- Tanuló belép a kóddal, megadja a nevét, kitölti a tesztet.
- A válaszok a backendhez kerülnek, a tanár pedig **.xlsx** fájlban letölti (Office-kompatibilis).

## Excel formátum
- `data/szavak.xlsx`
- Munkalapok: 4.–8. évfolyam (tetszőleges sheet név is jó, a program listázza)
- Oszlopok:
  - A: lecke
  - B: angol szó
  - C: magyar szó

## Futtatás GitHub Pages-en
1. Tedd fel a repóba a fájlokat.
2. Settings → Pages → Deploy from a branch → `main` + `/root`
3. Nyisd meg a Pages linket.

## Backend (kötelező az online mentéshez)
GitHub Pages **nem tud fájlt menteni** (statikus), ezért a mentéshez és az XLSX exporthoz külön backend kell.

### Lokális futtatás
```bash
cd backend
npm install

# Tanári jelszó és token (egyszerű védelem)
export TEACHER_PASSWORD="valami-eros-jelszo"
export TEACHER_TOKEN="valami-hosszu-token"

npm start
```

Ezután a böngészőben a felső **API** mezőbe írd be:
```text
http://localhost:3000
```

### Online deploy
- Render / Fly / Railway stb. (Node app)
- Állítsd be a környezeti változókat:
  - `TEACHER_PASSWORD`
  - `TEACHER_TOKEN`

Majd a GitHub Pages-en futó frontendben a felső **API** mezőbe a backend URL-jét add meg.

## Feladattípusok
- Magyar → írd angolul
- Magyar → válaszd az angolt (4 opció, ugyanabból a leckéből; ha kevés szó, kiegészít sheetből)
- Angol → válaszd a magyart (4 opció, ugyanabból a leckéből; ha kevés szó, kiegészít sheetből)

Pontozás: 1 helyes = 1 pont.