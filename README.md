# Kategorisering av dagligvaror

Liten intern sida som lägger ett varunamn i en produktgrupp. Klassningen görs med TypeSafe Jev (`typesafe/jev-1.13`) via OpenRouters Decisions API, inte via chat completions.

En sida, ingen databas, ingen inloggning.

## Starta

```bash
npm install
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

## API-nyckel

Nyckeln läses bara på servern, från `OPENROUTER_API_KEY`.

```bash
cp .env.example .env.local
```

Lägg nyckeln i `.env.local`:

```
OPENROUTER_API_KEY=sk-or-...
```

Starta om servern efter att du ändrat env. Next.js läser `.env.local` vid start.

Nyckeln krävs. Saknas den svarar klassificering och granskning med ett fel. Servern skickar `POST https://openrouter.ai/api/alpha/decisions` med modellen `typesafe/jev-1.13`.

## Så funkar anropet

`POST /api/classify` med `{ "query": "ica blåbär frysta (250g)" }`.

Servern skickar artikelbeskrivningen som `state.product` och alla produktgrupper som en Choice-fråga. Instruktionen säger att artikeln är en dagligvara. Jev tar högst 255 alternativ. Listan har 195, så det räcker med en fråga. Ingen extra övrigt-kategori läggs till. Rader som redan finns i filen, till exempel Övrigt, följer med.

Svaret visas som topp 10, sorterat på sannolikhet. Den valda gruppen är markerad. Under listan: latency, `input_tokens`, `output_tokens`, `usage.cost`, modell-id och confidence.

Jev skriver ingen prosa och ingen motivering. Texten under namnet är produktgruppens egen beskrivning, inte något modellen har skrivit.

## Vad confidence betyder

Confidence är ett tal mellan 0 och 1 som säger hur koncentrerad fördelningen är.

Ett högt värde betyder att nästan hela sannolikheten ligger på ett alternativ. Ett lågt värde betyder att flera produktgrupper är nästan lika troliga. Det är inte ett mått på att arbetsflödet är säkert att automatisera, bara på att fördelningen är spetsig eller platt.

## Data

`epg_categories.xlsx` i projektroten läses när servern startar (SheetJS) och cachas i minnet. Filen har kolumnen `Produktgrupp`. En beskrivningskolumn (`beskrivning` eller `beskrivning av produktgruppen`) används om den finns. Rubriken `EpgNamn` accepteras också som namnkolumn.

Saknas xlsx-filen läser servern `data/categories.json` i stället.

Varje produktgrupp får en stabil slug från namnet: gemener, `å`/`ä` → `a`, `ö` → `o`, övriga diakriter bort, skiljetecken blir bindestreck. Vid krock läggs ett löpnummer till.

Kriterietexten till Jev är produktgruppens namn. Finns en beskrivning blir den `Namn: beskrivning`.

Exportera JSON så den kan committas:

```bash
npm run export:categories
```

Det skriver `data/categories.json`.
