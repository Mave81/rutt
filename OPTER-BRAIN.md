# OPTER-BRAIN – allt RUTT måste veta om Opter

Läs den här filen **innan** något i RUTT ändras som rör Opter. Varje regel här är läst ur Opter Drivers egen källkod
(dekompilerad APK, `com.opter.driver.*`) eller sedd i Kentas skärmdumpar/dumpar. Står det **[OVERIFIERAT]** har det
inte setts fungera mot servern ännu – då får det aldrig sägas till Kenta att det fungerar.

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
| Confirm revoked (kvittera återkallad) | – | ✘ **saknas** |
| Artiklar (Bomkörning, Budtransport TIM, Express, Inbärning, Lastningstid, Lossningstid, OB1 – "Enhet 1") | ArticlesPermission (Kentas kontor: **true**) | ✘ **saknas** – ShipmentArticle + ShipmentPriceItem (SPI_SAR_Id, SPI_Unit1Quantity) |
| Tillägg | AddServicePermission (Kentas kontor: **false**) | dolt, som Opter |
| Ändringar (Vikt, Volym, Pallplats, Flakmeter, Kollin, Tid, Avstånd, Fraktsedel, Littera, Ref …) | ChangesPermission + SHI_*Permission | ✔ (Tid 3.40) |
| Kollin (Nytt kolli: vikt, volym, L/B/H, kollislag, godstyp, flakmeter, kollinr, antal) | – | ✘ saknas |
| Avvikelser (Godsskada, Emballageskada, Felaktigt kolliantal, Bristfälligt emballage) | DamagesPermission | ✔ |
| Bifogade filer (visa + Lägg till) | – | delvis: lägga till bild ✔, visa lista ✘ |
| Lägg till bild (Kamera/Galleri) | AddImagePermission | ✔ |
| Ge bort / (alla) – Välj fordon | GiveAwayPermission | ✔ (ge bort), "alla" ✘ |
| Frågor (ShipmentQuery: vid hämtning/lämning, ja/nej eller text) | – | ✘ saknas |
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

- Läs inte adressens koordinater före adresstexten vid GPS (Morabergsvägen 7 i stället för 25).
- Gissa aldrig: tidspassning finns ofta bara i lila raden (Products/DeliveryOptionNames) eller i fritext "tidspasning 06;50".
- Visa aldrig en återkallad order som ny eller som att-göra. **Bugg i RUTT ≤3.42**: `classOf` lägger 'revoked' som 'new', och har du redan accepterat ligger den kvar i planen som att-göra.
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
