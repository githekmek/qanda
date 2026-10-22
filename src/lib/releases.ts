export const RELEASE_NOTES = [
  {
    version: "2026.10.22",
    date: "22. Oktober 2026",
    title: "Entwürfe und lebendigere Kommentare",
    items: [
      "Private Fragenentwürfe lassen sich vorbereiten, speichern und später im eigenen Zug verwenden.",
      "Kommentare bieten ein mitwachsendes Textfeld mit bis zu 800 Zeichen.",
      "Mit 24 Emojis auf Kommentare reagieren und mit Zitat antworten.",
      "Die Darstellung Standard heißt jetzt System und folgt weiterhin deiner Geräteeinstellung.",
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
