# OPTER-BRAIN – allt RUTT måste veta om Opter

Läs den här filen **innan** något i RUTT ändras som rör Opter. Varje regel här är läst ur Opter Drivers egen källkod
(dekompilerad APK, `com.opter.driver.*`) eller sedd i Kentas skärmdumpar/dumpar. Står det **[OVERIFIERAT]** har det
inte setts fungera mot servern ännu – då får det aldrig sägas till Kenta att det fungerar.

Regel nr 0 (Kenta 28 okt): **RUTT gör exakt som Opter – fast bättre att använda.** Allt som når Opter eller styr arbetet
(GPS, kvittens/signering, statusar, frågor, fraktsedel, inställningar, vad som skickas och i vilken ordning) ska bete sig
som i Opter Driver. Det enda RUTT gör på eget sätt är knappar, utseende och hur lätt det går. Hittar vi en skillnad: rätta den,
skriv in den här och lägg ett test mot Opters regel.
Regel nr 1: **Säg aldrig att något funkar förrän det är verifierat.** Säg alltid vad som är verifierat och vad som inte är.
Regel nr 2: Gör allt själv – lämna aldrig manuella steg till Kenta.
Regel nr 3: Gör det som Opter gör. Avvik bara när Kenta bett om det, och skriv då in avvikelsen här.

---

## 1. Källor att kolla mot

| Vad | Var |
|---|---|
| Opter Drivers källkod | `/home/claude/opter/src/sources/com/opter/driver/` (syncdata/ = tabeller, ShipmentListFragment/ShipmentDetailViewPager = flöden) |
| Opters texter | `/home/claude/opter/src/resources/res/values/strings.xml` (bara engelska; svenska texter i Kentas skärmdumpar) |
| RUTT:s protokoll | `src/opter/protocol.js` (fältnummer `F`, `CET`, kodare/avkodare) |
| RUTT:s klient | `src/opter/OpterClient.js` |
| Tester | `__tests__/` (edit, status, pod, forsening, tid, nav …) – `npx jest` |

Fältnummer = **ordinal i entitetens `PropertyNumber`-enum** (0 = None). Ta fram dem med:
```
awk '/enum PropertyNumber/{f=1;i=-1;next} f&&/\}/{f=0} f{gsub(/[ ,]/,""); if($0!=""){i++; print i, $0}}' Shipment.java
```
Ändringstyper (CET) = ordinal i `ShipmentChangeValue.CET_ChangeElementType` – **inte samma nummer** som Shipment-fälten.

## 2. Förbindelsen

- SignalR, BinarySerializer V2. MessageType: Logon 3, Synchronize 5, ServerNotificationPush 16, AssignShipmentToAnotherResource 7 (Ge bort).
- Strängar är UTF-8 (Java: `new String(bytes,"UTF8")`). Emoji går att koda men **Opter-chatten visar dem inte** (Kenta har sett det) – skicka aldrig emoji till Opter, bara i SMS.
- Nya underrader: OFF_Id 0, XXX_Id 0 (huvud + 250 = 0).
- Ordning för underrader i en ShipmentEdit: AddService → Damage(+DamageAttachment) → StatusLog → Change(+ChangeValue) → Package → Pod → Query → PriceItem. Bild = Attachment.
- RUTT:s egen relogin + `client.reset()` efter 45 s hängning. **Ingen** withAutomaticReconnect (krockade och hängde allt).
- Lösenordet till Opter rör Claude aldrig.

## 3. Ordern (Shipment) – fält som används

| # | Fält | RUTT-namn | Betydelse |
|---|---|---|---|
| 11 | SHI_SHS_Id | shsId | aktuell status |
| 29 / 122 | SHI_Products / SHI_DeliveryOptionNames | products / deliveryOptionNames | lila raden i Opter: "Trängselavgift, Tidspassning" |
| 36 | SHI_TimeMinutes | timeMinutes | "Tid" (minuter, Opter visar timmar) |
| 55 | SHI_DriverMessage | driverMessage | förarmeddelande |
| 59 | SHI_OrderId | orderId | ordernumret föraren ser (t.ex. 232245) |
| 30 | SHI_FreightBill | freightBill | fraktsedelnr |
| 60 | SHI_Locked | locked | låst |
| 66 / 67 | SAS_Revoked / SAS_RevokedConfirmed | revoked / revokedConfirmed | **återkallad** / föraren har kvitterat återkallningen |
| 71 | SHI_OrderReceiver | orderReceiver | vem på kontoret som tog emot ordern |
| 105 / 106 | SHI_TFR_Id / SHI_TimeFailureComment | tfrId / tfComment | förseningsorsak + kommentar som redan finns |
| 107 / 108 | SHI_CustomerForceDelayReasonOnDelay / …DamageOnDelay | forceDelayReason / forceDamageOnDelay | kunden kräver orsak / avvikelse när sen |
| 124–135 | Latest/Earliest Delivery/PickUp DateTime + DateTTY + TimeTTY | latestDelDT … | tider; TTY Fallback = "ingen tid satt" |

## 4. Statusar – exakt som Opter

- En order har egna ShipmentStatus-rader (SHS_Accepted, Pickup, Delivery, Completed, Rejected, Pod, Order …). Nästa status = nästa i `SHS_Order`.
- **Ny** = aktuell status har varken accepted/pickup/delivery/completed/rejected, och ordern är inte återkallad.
- **Återkallad och inte kvitterad** (`isRevokedAndNotConfirmed`) räknas som "kräver uppmärksamhet" precis som en ny order → notis.
- Färger i Opters lista: återkallad `#D55E00` (orange-röd), låst `#E8E8E8`, ny `#F0E442`.
- Återkallad visas med texten "Återkallad" i stället för statusnamnet.
- **Kvittera återkallad**: menyvalet `confirm_revoke` ("Confirm revoked" – den svenska texten har jag inte sett) eller "sätt nästa status" på en återkallad order → sätter bara `SAS_RevokedConfirmed = true` (fält 67) och synkar. Inget annat skickas.
- **Vem som återkallade finns inte i Opter-datan.** Det enda namn som finns är SHI_OrderReceiver (vem som tog emot ordern) och chattens FTM_FirstAndLastName. Hitta aldrig på en avsändare.

## 5. Lastad / Lossad / kvittens (POD)

- Kvittenstyper: bara DefaultPodType (ProofOfDelivery.loadDefaultPodTypes), `allowBeforePickup` / `allowAfterPickup`.
- Krav = **orderns** krav (SHI_Pod*Mandatory) **OCH** kvittenstypens krav.
- Status + kvittens skickas i samma synk (ShipmentStatusLog + ShipmentPod + ShipmentPackagePod per kolli + SHI_ExternalId).
- Fungerar det inte: status ensam, sen kvittens för sig ("Ny kvittens").
- Flera order på en gång (Opter: kryssrutor i Att göra, "Lastad (alla)") – **även olika adresser**. Samma signatur på alla. RUTT: "Lossa även order till andra adresser här" → Markera-läget.
- Bekräftat först när en färsk full synk visar den nya statusen.

## 6. Försening (förseningsorsak)

- Kontrolleras när den nya statusen är en leveransstatus och `isTimeAfterLatestDeliveryTime(nu)`:
  - båda TTY = Fallback → aldrig sen
  - datum + tid → jämför hela tiden
  - bara datum → jämför datumdelen (sen först nästa dag)
- Kräv orsak om SHI_CustomerForceDelayReasonOnDelay och SHI_TFR_Id == 0. Kräv avvikelse om …ForceDamageOnDelay.
- Skickas som ShipmentChange per order: CET 106 (kommentar, sträng) + CET 107 (TimeFailureReason-id, int). Bara om kommentaren inte är tom och id > 0.
- Orsakerna: tabell TimeFailureReason (1 id, 2 AvailableInMobileDevice, 3 Active, 4 Name, 5 Description). Bara aktiva + mobil.
- Opter har också ett eget menyval "Förseningsorsak" (AddDelayReason) – finns inte i RUTT ännu.
- RUTT 3.42 har detta. **[OVERIFIERAT mot server]** – inga TimeFailureReason-rader sedda i Kentas data ännu.

## 7. Ändra en order (menyn i Opter)

Opters menyval (`ShipmentListFragment.OptionsItem`) och var RUTT står:

| Opter | Behörighet (Setting) | RUTT |
|---|---|---|
| Sätt nästa status / (alla) | ManualStatusChange*Permission, SetMultipleStatusPermission | ✔ |
| Välj status… | SetArbitraryStatusPermission | ✔ |
| Leveransbevis | ProofOfDeliveryPermission | ✔ |
| Confirm revoked (kvittera återkallad) | – | ✔ 3.43 (`client.confirmRevoked`, fält 67) **[OVERIFIERAT mot server]** |
| Artiklar (Bomkörning, Budtransport TIM, Express, Inbärning, Lastningstid, Lossningstid, OB1 – "Enhet 1") | ArticlesPermission (Kentas kontor: **true**) | ✔ 3.52 – Mer → Artiklar + i kvittensen. ShipmentChange: CET 68 SPI_SAR_Id (ny, SCV_SPI_Id utelämnas) + 45 Unit1Quantity (+46, 59 Descr); befintlig rad = SCV_SPI_Id (prop 4). **[OVERIFIERAT mot server]** |
| Tillägg | AddServicePermission (Kentas kontor: **false**) | dolt, som Opter |
| Ändringar (Vikt, Volym, Pallplats, Flakmeter, Kollin, Tid, Avstånd, Fraktsedel, Littera, Ref …) | ChangesPermission + SHI_*Permission | ✔ (Tid 3.40) |
| Kollin (Nytt kolli: vikt, volym, L/B/H, kollislag, godstyp, flakmeter, kollinr, antal) | – | ✘ saknas |
| Avvikelser (Godsskada, Emballageskada, Felaktigt kolliantal, Bristfälligt emballage) | DamagesPermission | ✔ |
| Bifogade filer (visa + Lägg till) | – | delvis: lägga till bild ✔, visa lista ✘ |
| Lägg till bild (Kamera/Galleri) | AddImagePermission | ✔ |
| Ge bort / (alla) – Välj fordon | GiveAwayPermission | ✔ (ge bort), "alla" ✘ |
| Frågor (ShipmentQuery: vid hämtning/lämning, ja/nej eller text) | Query (default true) | ✔ 3.52 – krävs när statusen har SHS_QueryEnabled (22): "Innan du lastar" + i kvittensen. Svar = ShipmentQuery (befintlig nyckel) → ny ShipmentAnswer (1 SHI, 2 SHQ, 5 text / 6 bool, 7/8 lat/lng), före statusen. **[OVERIFIERAT mot server]** |
| Lås upp, Skriv ut, SMS-signatur, Lösa artiklar, Kontrollera fraktsedel | – | ✘ (sällan använt) |

## 8. Chatten (FreeTextMessage)

Fält: 1 RES_Id, 2 VHC_Id, **3 SHI_Id (meddelandet kan höra till en order!)**, 4 Outgoing, 5 Confirmed (läst), 6 Text, 7 Created, 8 ExternalId, 9 FirstAndLastName (avsändaren).
- Läst = sätt FTM_Confirmed (markRead).
- Opters notis: titel = avsändarens namn, text = meddelandet, knapp "Markera som läst".
- Skickat räknas som mottaget först när servern gett meddelandet ett eget id.

## 9. Notiser i Opter

- Kanaler: orderuppdatering och nytt meddelande, `setDefaults(7)` = standardljud + vibration + ljus.
- Opter upprepar påminnelsen för en order som inte är accepterad. RUTT: var 15:e min tills accepterad (kanal `rutt_uppdrag`).

## 10. Kända fel att aldrig göra om

- **GPS exakt som Opter** (XmlParser.getLayout + Address.toStringForGoogleMaps): Opters egna ADR-koordinater om de finns (≠ 0), annars texten "Gata Nr, Postnr Ort". RUTT:s egna uppslagna koordinater (geo:true, Nominatim) används ALDRIG för navigering. Fel som hänt: Morabergsvägen 7 i stället för 25 (uppslagna koordinater), Döbelnsgatan 73 i stället för 44 (3.34–3.54 tog adresstexten före Opters koordinater, 28 okt).
- Gissa aldrig: tidspassning finns ofta bara i lila raden (Products/DeliveryOptionNames) eller i fritext "tidspasning 06;50".
- Visa aldrig en återkallad order som ny eller som att-göra. Bugg i RUTT ≤3.42 (`classOf` lade 'revoked' som 'new'/att-göra) – rättad i 3.43: egen klass 'revoked', röd rad + Kvittera, lista under Klart → Återkallade (test: `__tests__/app-aterkallad.test.tsx`).
- Lastplanen: en ruta = en pall, 18 platser (3 × 6), visa namn, inte siffror.
- Egna jobb (Joels sedlar) skickas aldrig till Opter.
- BUILD-raden ändras bara med `sed "s/^const BUILD = .*/…/"`.

## 11. Checklista innan jag säger "klart"

1. Står regeln i Opters kod? Ange fil + rad i commit/svar.
2. `npx jest` grönt + nytt test för det nya.
3. Skärmbild i webbharnessen (ljust + mörkt).
4. APK byggd i CI, sha1 kontrollerad på telefonen.
5. Svaret till Kenta: **verifierat** vs **inte verifierat** – separat.

## 12. Hur Kenta jobbar (styr designen)

- **Vid hämtning** frågar butiken/terminalen "vad ska du lasta och vart ska det?". Därför ska hjälpen ("Visa för butiken": fraktsedel · mottagare · adress · kolli) finnas vid HÄMTNING.
- **Vid lämning** har kunden följesedeln. Där behövs bara: vem som ska ringas/aviseras, kolli och Lossad. Ingen "jag lämnar …"-text.
- Markera flera ska vara lätt: håll in en rad, tryck på fler (även andra adresser), en knapp nere: "Lastad · n" / "Lossad · n".
- Design: kompakt och proffsig. Raka hörn (≈6 px), 52 px rader, Barlow / Barlow Semi Condensed, nummer i IBM Plex Mono. Inga mörka block i ljust läge, ingen glow, inga lodräta linjer.

## 13. Läget 3.43 (22 okt)

- Jobblistan A, chatten (FTM_SHI_Id → ordernummer på meddelanden), nummer per jobb, notisljud (RuttTools.kt, en kanal per ljud), Barlow i hela appen (src/fontpatch.js + res/font).
- **[OVERIFIERAT på telefon]**: kvittera återkallad mot servern, att Barlow syns (patchen av Text), notisljuden/kanalerna, telefonens ljudväljare, "Ny kontakt", kopiera.

## 14. Läget 3.45 (26 okt) – turlistor, hela körningen, timjobb
- **Bevego turleveranslista** (papper, "TURLEVERANSLISTA", Leveransnummer + Tur, t.ex. 64499 / 050_01_A4): Opter-ordern (234014, Bud Zon-Zon, Bevego Älvsjö → "Distribution" utan adress, info "skriv timmar") säger INTE vart godset ska. Pappren gör det.
  - `src/sedel.js` bevegoTur: mottagare, adress, kontakt (namn före första numret), tel/tel2, avisering, kolli (typ KLOVE/PALL/STÄLL/KARTONG + Bevego-ordernr), artiklar.
  - `src/tur.ts` mergeTur: sidor till samma kund = ett stopp (Opejra: 2 pall + 1 kartong, ordrar 30219989 + 30198658). turToEgen → eget jobb med `parent` = Opter-ordern. turParents: Opter-order hämtas på Bevego + lämning utan adress/"Distribution".
  - App: Opter-orderns lämning göms så länge stopp finns kvar, pallarna räknas på stoppen (parent pal 0). Lastad på ett stopp → hela familjen + Opter-ordern (Lastad till Opter). Lossad på sista stoppet → Opter-orderns lämning läggs i samma kvittens (Lossad till Opter).
- **Skanna** (planen överst + tom plan + "Läs in turleveranslistan" i ordern när lämningen saknar adress): Kamera eller Bilder (flera). Turlista → TurScan; annan sedel → "Gör till jobb". Delad bild/PDF som är turlista går också till TurScan.
- **Ordern (bladet)**: KÖRNINGEN med båda ändar (Hämta/Lämna: vem, adress, tid, kontakt, ring), Tjänst, Kund, Beställare, Opter-order, Fraktsedel, Order, Referens, Gods, Kolli/Pall, Vikt, Sträcka, Status i Opter.
- **Timjobb** ("skriv timmar", "skriv tid", "per timme", "timdebit"…, `isTimjobb`): Tid öppnas själv vid Lossad i läget start–slut, start = när du lastade, slut = nu. Skickas som CET 34 (SHI_TimeMinutes) på första Opter-ordern i kvittensen – samma som Opter Driver.
- **Registrerat i Opter?** editShipment jämför orderns kolumner efter synk mot det som skickats (`changesSeen`): "Syns i Opter" eller "Skickad – Opter visar inte Tid (min) än".
- Ej verifierat mot riktig server: att Opter skickar tillbaka timeMinutes på förarens order efter ändring.

## 15. Läget 3.46 (27 okt)
- Tryck på ett stopp (rubriken eller NÄSTA "visa ›") med EN order → hela ordern direkt. Flera order → stoppet, där varje order (Ska till / Lämna här) är tryckbar → hela ordern.
- Ordern: KÖRNINGEN (hämta + lämna, oavkortat) → TEXT I ORDERN (hela Opter-texten, markerbar) → På timme → detaljer.
- **På timme Ja/Nej** i ordern och ovanför Lossad-reglaget. Förval = RUTT:s läsning ("skriv timmar"), ditt val sparas i ost[cid].tim och går före. Ja → Tid öppen vid Lossad (start = Lastad, slut = nu). Turlista: valet ligger på Opter-ordern, tiden fylls i vid sista stoppet.

## 16. Läget 3.47 (27 okt) – BDX-fraktsedlar
- **BDX Företagen fraktsedel** ("Distribution BDX Företagen AB – Mottagarens exemplar", Sändningsnr 026 559 874 8, Sida 1 (1 av 5)). `bdxFrakt` i src/sedel.js läser BARA övre delen (Kvittensunderlag nedanför är en kopia):
  - Mottagare (vänster kolumn): företag, gata + nr, extrarad = referens ("AO20127") + kontakt ("David Erixell") eller telefon ("+46722052120" → 0722052120) + kontakt; POSTNR/ORT; MOTT/REF, TELEFON, FRAKTBET.
  - Avsändare (höger): namn, adress, postnr/ort, AVS.REF.
  - Kollirader: SSCC (18 siffror, 3732…), kollislag CT=Kartong, EP=Europapall, OP=Engångspall, PK=Ospecificerat kolli, varuslag, vikt. Totalt antal kolli (kontroll "10 av 10"), total vikt, Ingående ordrar, Tillval/Anvisningar/Övrig information, EUR-pallar.
  - Sidor med samma sändningsnr slås ihop. Sida 2–5 har Övrig information (format ej sett än).
- **Bild på tvären**: `src/ocr.ts` readPage – läser, och om texten inte blir vanliga rader vrids bilden 90/270/180 (native `RuttSms.ocrRot`, sparar den vridna bilden).
- **Bekräfta adressen** (alla skannade stopp): "Stämmer adressen?" Ja, stämmer / Ändra / Ta om bild. "Lägg i planen" först när alla är bekräftade.
- **Redan i Opter?** `matchOpter`: samma sändningsnr/fraktsedel/ordernr eller samma gata+nr (+postnr) → inget nytt stopp; sedeln sparas på ordern (rutt.sedelinfo.v1) och syns i ordern som FRAKTSEDEL (INLÄST) med alla kollin, och varning om sedelns adress skiljer sig från Opters.
- Annars: eget stopp, godset räknas som redan lastat (du fotar när du lastar). Opter-order utan adress ("Distribution") kan väljas som tillhörande, som för Bevego.
- Testat med två riktiga foton (Moby, NCC) lästa med tesseract + en ML Kit-lik version av Moby. Ej verifierat: ML Kit i telefonen på dessa sedlar och vridningen på riktig telefon.

## 17. 3.48 (27 okt) – Kentas besked
- **På timme är aldrig förvalt.** "skriv timmar" i ordern betyder inte att dagens jobb är på timme. RUTT visar bara "ordern nämner timmar – tryck Ja om jobbet är på timme". Tid skickas bara när Kenta valt Ja (eller lägger till tid själv i kvittensen).
- **BDX behöver inte skannas**: när ordern säger Hämta på BDX har Opter-ordern det som behövs, BDX ger papperen. Skanna finns kvar för Bevego-turlistor och Inomec/Cramo; BDX-läsningen ligger kvar men behövs inte i vardagen.

## 18. 3.49 (27 okt)
- **På timme Ja/Nej finns i varje Opter-order**, även vid Hämta (BDX 234661 "3 stopp" visade det inte – bara lämningar hade det). Ja → Start sätts direkt (när du lastade, annars nu). Start och Slut går att ändra: "Nu" eller skriv 7.15 / 0715 / 07:15. Summan visas (8 h 15 min). Sparas i ost[cid].timStart/timEnd.
- Vid Lossad: Tid öppen med samma start och slut (slut = nu om inget satts) → skickas som Opters Tid (CET 34).
- "Läs in turleveranslistan" visas inte för BDX-hämtningar (Kenta: BDX ger papperen, behöver inte skannas).

## 19. 3.50 (27 okt) – Tid kom inte fram (09:45–12:45 → Opter visade tom Tid)
- **Fel**: 3.45–3.49 skickade Tid (och tillägg) i en egen sändning 8 s EFTER Lossad. Opter Driver gör tvärtom (ShipmentDetailViewPager, statusdialogen): kvittens (registerPod), AddService och ShipmentChange (Ändringar) läggs på ordern och sedan setStatus – allt i samma veva, innan ordern är klar.
- **Nu**: sendUnload skickar Tid (CET 34, minuter) + tillägg + försening som en ändring direkt före Lossad-statusen i samma kö. Ångra stoppar båda. Efteråt visas "Tid 3 h syns i Opter" / "skickad – Opter visar den inte än" (changesSeen) och raden hamnar i orderns historik.
- Tid i Opter = minuter (Util.getTimeHourAndMinutesString delar med 60).
- Ej verifierat mot riktig server än. Ordern från förmiddagen (09:45–12:45) fick ingen Tid.

## 20. 3.51–3.52 (27 okt) – genomgång av hela appen
- Opters statusdialog (ShipmentDetailViewPager ~985–1080): vid Lastad/Lossad visas Kvittens, SMS-signatur, Fraktsedelkontroll, Tillägg, **Artiklar**, **Ändringar (krävs om SHS_Changes, prop 12)**, **Frågor (krävs vid hämtning/lämning om SHS_QueryEnabled, prop 22)**, Försening, Avvikelse – och allt läggs på ordern före setStatus.
- RUTT 3.52: StatusExtras (src/ui/StatusExtras.tsx) = Frågor + Artikel + Ändringar i kvittensen och i "Innan du lastar". Skickas i pre-ändringen före statusen (sendLoad/sendUnload).
- Tidshjul (src/ui/Wheel.tsx), navigera-knapp vid varje adress, strip-etiketter på en rad, tillgänglighetsnamn på ikonknappar.
- Kvar att bygga (finns i Opter, inte i RUTT): Kollin (nytt kolli), visa bifogade filer, fraktsedelkontroll (CUS_ForceFreightBillCheck*), SMS-signatur, Ge bort alla.

## 21. 3.53 (27 okt)
- Imorgon-planen (PlanDay): varje rad går att trycka på → samma orderblad som idag (OrdersView sheetOnly + openReq).
- "1 stopp hittas inte på kartan" = Lyckås måleri, "klockelundsvägen" (utan nummer, nybyggt område) 12363 Farsta. Nominatim-reserv: gata+postnr+ort → fritext → gata+ort → postnr → ort; ungefärlig plats markeras (geoApprox) och PlanDay säger vilket stopp. Gamla "hittades inte" provas om.

## 22. 3.56 (28 okt) – lika som Opter, punkt för punkt
| Opter-regel | Källa | RUTT | Test |
|---|---|---|---|
| Inställningar: SISTA aktiva raden med exakt namn; bool bara "true" (valfria versaler); int via parseInt med standard | syncdata/Setting.java | `settingRow/setting/settingBool/settingInt` | installningar.test.js |
| Ändringar krävs (SHS_Changes) → minst ett ändrat fält innan statusen | ChangesList | StatusExtras `requireChanges` | app-fragor, installningar |
| Kvittens vid hämtning: Lastad med SHS_Pod → kvittens först, bara typer med AllowBeforePickup, går med statusen | ShipmentDetailViewPager ~985 | `stop.pod` på hämtstoppet, App `pickSign` | pod.test.js, app-hamtkvitto |
| Fraktsedelskontroll: kundens CUS_FreightBillCheck*/Force* (20–23), ordertyp via ADR_HUB_Id, CheckFreightBillAtAllPickUpAndDelivery; längd (26), Modulus10 (24); Force = tomt fält; ändrat nummer → CET 30 | ShipmentDetailViewPager ~1013, shipment/FreightbillCheck | `freightBillCheckFor/freightBillError`, StatusExtras "Fraktsedel" | fraktsedel.test.js, app-fraktsedel |
| Nästa status = lägsta SHS_Order över nuvarande, UserOption, ej Rejected; utan SetArbitraryStatus går RUTT stegvis | Shipment.calculateNextStatus | `nextStatusOf/statusChain` | installningar.test.js |
| GPS: ADR-koordinater om ≠ 0, annars "Gata Nr, Postnr Ort". Koordinaterna används bara om de är märkta `opterLL` (sätts i protocol.js från Opters adress) – Paradistorget 4 blev 2 när andra koordinater läckte in | XmlParser.getLayout (jadx --show-bad-code: `ADDRESSTOLATITUDE.equals("0") ? ADDRESSTOSTRING : lat,lng(text)`), Address.toStringForGoogleMaps | OrdersView `navigate` | nav.test.js |
| Lösa artiklar (LooseItemsPermission, av som standard) | ShipmentDetailViewPager ~1100 | **Inte byggt** – RUTT visar en rad om kontoret har det påslaget | – |

Kartuppslag (Nominatim) som svarar med GATAN fast adressen har husnummer räknas som ungefärliga (`gata`) – påverkar bara körordning/tider, aldrig navigering.

[OVERIFIERAT mot servern]: kvittens vid hämtning och fraktsedels-ändringen har inte setts gå igenom hos Opter ännu.

