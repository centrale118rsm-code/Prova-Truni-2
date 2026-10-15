# Turni 118 — Gestionale turni

Gestionale web per i turni del 118 (prima gli **autisti soccorritori**, poi gli **infermieri**).
Riunisce tutte le funzioni del file `Autisti 2026.xlsm` e del programma Turni Infermieri,
con un’area per gli operatori e una per coordinatori e amministratori.

Si apre da qualsiasi browser, si installa sul telefono come app e funziona anche offline.

## Cosa fa

**Per tutti**
- **Calendario turni** identico al foglio TURNI: banda del mese, contatori di copertura (T mattina, T pomeriggio, T notte, D mattina, D pomeriggio, riposi), per ogni operatore la colonna assenza e il turno con il colore della **linea** del ciclo POM → MAT → NOTT → SM → R, festivi, domeniche, separatore settimanale, doppioni in rosso, bordi rosso/blu per *esigenza di servizio* / *richiesta personale*, reperibilità a 4 fasce (00-07, 07-13, 13-20, 20-24) con le cessioni colorate. In testa: ferie rimaste, pn, ore e giorni di permesso.
- **I miei turni**: vista personale nuova — quadrante 24 ore con lo stato in tempo reale e il conto alla rovescia, radar (prossimo weekend libero, giorni liberi di fila, notti e reperibilità in arrivo, saldo ore), nastro settimanale a ore reali con confronto con un collega, mosaico dell’anno, scheda del giorno con colleghi e reperibilità.
- **In servizio oggi** (come ACCESSORIO TRASPO.), **Vista d’insieme**, **Cartellino** (come CARTELLINO).
- **Ore e saldi** (CONTEGGI ORARI): saldo settimanale sulle 36 ore che si trascina, ore accreditate per le assenze, vista “foglio”, esportazione CSV.
- **Ferie e permessi**: ferie dell’anno e residuo dell’anno precedente, permessi a giorni (pn) e a ore, tutte le assenze per codice, settimane consigliate e ponti.
- **Reperibilità**: calendario, riepilogo mese/anno, **quadro mensile ISS** stampabile (CONTEGGI ORE REP), ore per fascia.
- **Festivi**: lavorati, ore festive, non goduti, non lavorati, festivi di riposo.
- **Statistiche ed equità**: grafico annuo turno/diurno/casa (GRAFICO TURNI), notti, weekend, festivi, reperibilità.
- **Richieste**: ferie, residuo, permessi, permesso a ore, recuperi, cambio turno con un collega, cessione di reperibilità, malattia. Il collega accetta, il coordinatore approva, il calendario si aggiorna da solo.
- **Disponibilità e agenda** (con conciliazione famiglia), **notifiche**, calendario **.ics** per il telefono, **bacheca**, **uscite di gruppo**, **ruota della sfiga**.

**Gestione (coordinatore / amministratore)**
- Pannello di controllo, **Modifica turni** (tavolozza, pennello, selezione multipla, copia/incolla, scrittura veloce dei codici, annulla/ripeti, bozza e pubblicazione con notifica agli interessati), **bozza automatica** del mese a 5 linee, **controlli** (coperture, doppioni, smonto dopo la notte, riposo minimo, giorni consecutivi…), richieste da gestire, operatori (colori, spettanze, saldo iniziale, PIN), codici/orari/regole, **stampe e moduli**, **import dal file Excel** e export .xlsx, backup e copie di sicurezza, storico modifiche con ripristino, accessi, impostazioni, passaggio al nuovo anno.

## Avvio
È un sito statico: basta pubblicarlo con GitHub Pages (Settings → Pages → branch `main`, cartella `/`).
Al primo avvio carica i turni 2026 dal file `data/seed-autisti-2026.json` (estratto da `Autisti 2026.xlsm`).
Il primo accesso all’**area gestione** chiede di scegliere la password dell’amministratore.

## Dati: locale o cloud
- **Locale** (predefinito): i dati restano nel browser del dispositivo. Ideale per provare.
- **Cloud**: per condividere i turni tra tutti i dispositivi serve un progetto **Firebase dedicato** (gratuito).
  In *Impostazioni → Archivio cloud* incolla la configurazione, premi **Collega e verifica**, poi scarica
  `data/cloud.json` e caricalo nel repository: da quel momento tutti i dispositivi usano il cloud.
  Le regole consigliate sono in `firebase/firestore.rules`.

## Struttura
```
index.html, manifest.json, sw.js     app installabile e offline
css/app.css, css/myshifts.css        stile
js/profile.js                        codici, ore, colori, fasce (profilo autisti / infermieri)
js/calc.js                           formule del file Excel (ore, saldi, ferie, reperibilità, festivi, controlli)
js/store.js                          archivio locale / Firebase, bozza, storico, notifiche
js/excel.js                          import .xlsm / export .xlsx
js/views/*.js                        le pagine
data/seed-autisti-2026.json          turni 2026 estratti dal file Excel
```
