# RUTT-BRAIN – hur allt i RUTT fungerar

Läs den här **innan** något i RUTT:s gränssnitt eller flöden ändras. OPTER-BRAIN.md säger vad Opter kräver.
Den här säger vad RUTT gör, var det finns och vad som går till Opter. Inventerad ur koden 28 okt 2026 (3.56).
Radnummer gäller den versionen.

**Grundregel (Kenta 28 okt):** RUTT gör exakt som Opter i allt som når Opter (GPS, kvittens, statusar, tid, frågor).
Det enda RUTT gör på eget sätt är knappar och utseende. Appen är ett verktyg som ska göra vardagen lättare.

## 0. Tre regler för gränssnittet (beslut 28 okt, designförslag 2 + testversion)

1. **Var ordern kommer ifrån.** En Opter-order har ingen märkning. **INSCANNAD** betyder att den kommer från en fotad
   fraktsedel eller turlista, att den bara finns i telefonen och aldrig går till Opter. **EGET** betyder att du lagt
   till den själv. Inscannade ska kunna rensas bort i Klart.
2. **Ord, inte färgade rader.** Opter färgar raderna: ljusblå ny, vit godkänd, grön lossad. RUTT ska *inte* göra
   så. Varje order har i stället ett märke med ord och ikon (testversionen 28 okt):
   - **INTE MOTTAGEN:** klocka, helt orange. Du måste svara.
   - **INTE LASTAD:** låda, orange ram och orange text. Något du ska göra.
   - **LASTAD:** lastbil, grön text på ljusgrön botten. I bilen, på väg.
   - **KLART:** bock, helt grön. Lossad och bekräftad av Opter.
   - **NEKAD:** grå. **SKICKAS…:** guld. **INTE I OPTER:** röd.
3. **Färg = betydelse.**
   - Orange: det du ska göra nu.
   - Grön: klart och bekräftat av Opter.
   - Guld: tid (senast-tid som passerat, På timme).
   - Röd: bara "Opter fick det inte".
   - Blå: människor (ring, sms).

## 1. Skärmar

| Var | Vad |
|---|---|
| Inloggning | "Logga in mot Opter" (användarnummer, lösenord, Kom ihåg mig), "Server och demo", sen "Välj ditt namn" |
| Huvud | RUTT, chip för inloggning och GPS (öppnar Inställningar), koppen (Arbetstid: rast, lunch, avsluta), kugghjulet (Inställningar) |
| **Plan** | Idag eller Imorgon. Listan med stopp, dockan NÄSTA, Dra för Lastad/Lossad, Skanna, Ordning, raden Återkallad |
| **Jobbet** | Chatt med kontoret via Opter, SMS med förare, Folk (egna kontakter, förare från Opter), Trafikledningen, Chef |
| **Last** | Bilen ovanifrån: 3×6 pallplatser, hytt upptill, bakgavellyft nertill. Vad som lossas i vilken ordning. Bara för att läsa |
| **Klart** | Idag (lossade, ändra i efterhand), Dagbok (14 dagar, dagrapport), Återkallade |
| Nytt (dold flik) | Nås bara via den orange raden "n ny(a) order väntar på svar · Visa" |
| Inställningar | Utseende, Navigera med (Google/Waze), status, demo, notisljud, SMS till chefen, Felsök, GPS-position, Logga ut |

## 2. Orderns liv

| Läge | Hur det syns idag | Nästa steg | Går till Opter |
|---|---|---|---|
| **Inte mottagen** (ny) | Flik Nytt: "NY ORDER". Knapparna Neka, Skicka vidare, Acceptera. Notis + påminnelse var 15:e min | Acceptera | Status Bekräftad **direkt**, utan Ångra |
| Nekad (av dig) | "Neka ordern?" sedan "Ja, neka". Försvinner helt | – | Status Nekad |
| Skickad vidare | Välj förare, sen "Skicka" | – | GiveAway (meddelandetyp 7) |
| **Inte lastad** | HÄMTA (orange), orange ruta. Lämningsraden är grå: "väntar på lastning · hämtas hos X" | Dra för Lastad, knappen Lastad, eller Markera, sen Lastad · n | Lastad efter 8 s Ångra. Före Lastad: frågor/ändringar/fraktsedel ("Innan du lastar"), kvittens om Lastad kräver det |
| **Lastad** | LÄMNA (grön). I Last: "Ombord" | Dra för Lossad, sen kvittensen | – |
| **Lossad / Klart** | Klart: "LOSSAD hh:mm", mottagare, foto, senaste ändring, "Uppdaterad i Opter" | Tryck, sen Mer (ändra i efterhand) | Lossad + kvittens efter 8 s Ångra. Före statusen: försening, Tid, svar, ändringar, tillägg |
| Återkallad | Röd rad överst i Plan, "Kvittera" | Kvittera | confirmRevoked **[overifierat]** |
| Eget jobb | Märkt med källan (BEVEGO …) | Samma gester | Inget. SMS till chefen om det är påslaget |
| Inscannad turlista/BDX | Benen på Opter-ordern den hör till | Lastad på ett stopp = hela familjen. Lossad på sista stoppet = Opter-orderns lämning följer med | Bara Opter-ordern (förälder) |

**Ångra:** Lastad och Lossad väntar 8 s. Går appen i bakgrunden skickas allt som väntar direkt, utan Ångra.
Acceptera och Neka går direkt.

## 3. Markera flera

- **Hur:** håll in en rad (350 ms), eller håll in stoppets rubrik så markeras alla där.
- **Raden överst:** "✕ · n valda · Markera alla".
- **Dockan:** "Lastad · n" och/eller "Lossad · n".
- **Lossad · n:** en gemensam kvittens ("Samma kvittens för n order").
- **Kräver** SetMultipleStatusPermission.

## 4. Allt man kan göra på en order

- **Raden i Plan** öppnar orderbladet:
  - KÖRNINGEN (Hämta/Lämna med Navigera och Ring), inläst fraktsedel, TEXT I ORDERN, **På timme Ja/Nej + Start/Slut**.
  - Fakta: Tjänst, Kund, Opter-order, Fraktsedel, Gods, Kolli …, och personer (SMS/Ring).
  - "Lägg till nummer på jobbet", "Visa för butiken", Lastad/Lossad, **Mer**.
- **Stoppbladet** (flera order på samma ställe): Avisera, SKA TILL / LÄMNA HÄR, Navigera, **Säg till**, Butiken.
- **Mer** (EditSheet). Allt skickas direkt med "Skicka till Opter", och historiken visar om Opter fick det:
  - Ändra status, Skicka sparad kvittens, Ny kvittens, Lägg till bild.
  - Tillägg (**av** på Kentas kontor).
  - Artiklar: Bomkörning, Budtransport TIM, Express, Inbärning, Lastningstid, Lossningstid, OB1.
  - Tid, Ändring (kontorets fält).
  - Avvikelse: Godsskada, Emballageskada, Felaktigt kolliantal, Bristfälligt emballage.
- **Försening** finns bara i kvittensen, när ordern är sen. Kunden kan kräva orsak eller avvikelse.
- **Navigera:** Opters koordinater om de finns, annars adressen som text ("Gata Nr, Postnr Ort"). Aldrig RUTT:s egna uppslag.
- **SMS-mallar** till mottagaren ("hos er om ca N min", "står utanför", "kommer inte in"). Öppnar SMS-appen.

## 5. Kvittensen (Lossad)

**Ordning på skärmen:**
1. Typ av kvittens.
2. "Samma kvittens för n order".
3. Försenad (orsak, avvikelse).
4. Sätt: Signatur, Bara namn eller Kund ej på plats.
5. Underskrift.
6. Namnförtydligande (förslag från Opter och tidigare namn).
7. Foto (upp till 6).
8. Antal kollin.
9. Tillägg (dolt hos Kenta).
10. Fraktsedel, Frågor, Artikel, Ändringar.
11. Tid ("Timjobb eller tid som ska debiteras?").
12. Anmärkning, Kommentar.

**Klar är låst tills:**
- signatur, namn eller foto (det som krävs) finns,
- anmärkning finns om den krävs,
- undertyp är vald,
- försening och avvikelse är ifyllda,
- frågorna är besvarade,
- fraktsedeln är bekräftad,
- minst en ändring är gjord om statusen kräver det.

**Skickas i den här ordningen:**
1. Ändringar på ordern: försening (CET 106/107), Tid (CET 34), svar, ändringar, tillägg.
2. Eventuella mellanstatusar.
3. Lossad + kvittens: typ, namn, anmärkning, signatur, kolli, GPS och **bara första fotot**.

## 6. Skanna (TurScan, SedelSheet)

- **Var:** Plan, sen Skanna. Välj Kamera (en sida i taget) eller Bilder (upp till 10).
- **Vad RUTT läser:** turlista (Bevego) eller BDX-fraktsedel. Annat blir en vanlig sedel (eget jobb, SedelSheet).
- **Opter-ordern:** HÖR TILL OPTER-ORDERN (välj förälder eller "Ingen Opter-order").
- **Per stopp:**
  - "Stämmer adressen?" med Ja / Ändra / Ta om bild.
  - "Finns i Opter: order n" betyder att sedeln läggs på den Opter-ordern i stället för som eget stopp.
- **Lägg i planen** sparar allt lokalt. Det rensas efter 7 dagar.
- **Ta bort:** ett jobb tas bort i SedelSheet ("Ta bort jobbet"). Det sker direkt, utan fråga.
- **Rensa alla:** finns inte idag (se §0, ska byggas).

## 7. Automatiskt

- **Synk:** server-push, reserv var 30:e s (20 s i bakgrunden), återställning efter 45 s, länkkoll var 4:e s, automatisk ominloggning.
- **GPS:** position till Opter med Opters intervall, när du är inloggad och GPS är på.
- **Notiser:**
  - Ny order, påminnelse var 15:e min.
  - Återkallad.
  - Chatt.
  - Varje sort har eget ljud.
- **Chatten** markeras som läst när fliken Jobbet visas.
- **SMS till chefen:** Lastat ✅ / Lossat ✅ 8,6 s efter handlingen, om det är påslaget.

## 8. Kända brister (28 okt) – laga i tur och ordning

1. **Bara första fotot i kvittensen går till Opter.** Appen tillåter 6. App.tsx `podPayload` (rad ~822).
2. **Mer på ett inscannat turstopp** skickar stoppets egen `st`, som saknar `.live`. EditSheet kan då visa
   demolistor och "skickas inte". OrdersView.tsx rad 565. Härlett ur koden, inte kört.
3. **Tid på tre ställen:**
   - På timme i ordern (bara lokalt, fyller i kvittensen).
   - Tid i kvittensen (det enda som skickas vid Lossad).
   - Tid under Mer.
   - Ska bli **en** tid. Se designförslag 2.
4. **Tiden kom inte fram 28 okt** – ej återskapad. Misstänkta:
   - SignScreen.tsx rad 47–51 (nollställs när `saved` ändras).
   - App.tsx rad 1690 (Tid döljs tyst om fältet inte är ändringsbart).
5. **Avisering** finns bara i stoppbladet (flera order). Ett stopp med en order öppnar orderbladet, som inte har avisering.
6. **Nekade och skickade-vidare försvinner helt.** Klart visar dem inte.
7. **Bakgrunden skippar Ångra:** byter du till Opter skickas väntande Lastad/Lossad direkt.
8. **Acceptera och Neka saknar Ångra.**
9. **Chatten markeras läst** när fliken öppnas, även om du inte öppnat tråden.
10. **Ta bort jobbet och ✕ i Skanna** har ingen Ångra.
11. **Död kod:** `src/ui/OrderExtras.tsx`, `NavButton` i OrdersView, `addTimers` i App.
12. **Hämta-före-lämna på samma adress slås ihop till ett stopp** (OrdersView.tsx rad 262). BDX-sedeln hamnade
    under stopp 4 fast den hämtas på stopp 6.
13. **Inscannade order har ingen tydlig märkning** och kan inte rensas på en gång.
