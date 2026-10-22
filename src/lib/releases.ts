export const RELEASE_NOTES = [
  {
    version: "2026.10.22",
    date: "22. Oktober 2026",
    title: "Entwürfe, Emojis und Antworten auf Kommentare",
    items: [
      "Fragen lassen sich als Entwurf speichern und später anpassen – auch wenn du gerade nicht am Zug bist.",
      "Kommentare haben ein mitwachsendes Textfeld mit bis zu 800 Zeichen.",
      "Auf Kommentare kannst du mit Emojis reagieren oder mit Zitat antworten.",
      "Die Darstellung „Standard“ heißt jetzt „System“.",
    ],
  },
  {
    version: "2026.10.21",
    date: "21. Oktober 2026",
    title: "App installieren, Push und Folgefragen",
    items: [
      "Q&A lässt sich auf Android und iPhone zum Home-Bildschirm hinzufügen.",
      "Push-Benachrichtigungen können pro Gerät und Ereignis aktiviert werden.",
      "Zu beantworteten Fragen kann im eigenen Zug eine Folgefrage gestellt werden.",
    ],
  },
  {
    version: "2026.10.20",
    date: "20. Oktober 2026",
    title: "Profil und Benachrichtigungen",
    items: [
      "Neue Profilseite mit den Darstellungen Standard, Bunt und Dark.",
      "Optionale E-Mail-Hinweise für den eigenen Zug und neue Kommentare.",
      "Bestätigte E-Mail-Adressen ermöglichen einen sicheren Passwortreset.",
    ],
  },
  {
    version: "2026.10.14",
    date: "14. Oktober 2026",
    title: "Mehr Auswahl und bessere Gespräche",
    items: [
      "Multiple Choice unterstützt eine oder mehrere Antworten und bis zu acht Optionen.",
      "Gleiche Einzelantworten werden bei Mehrfachauswahl sichtbar markiert.",
      "Neue Kommentare werden hervorgehoben und lassen sich ein- und ausklappen.",
    ],
  },
] as const;

export const CURRENT_RELEASE = RELEASE_NOTES[0].version;
