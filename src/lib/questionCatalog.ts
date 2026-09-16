export type QuestionCategory = "LOCKER" | "SPICY" | "TIEF";

export const CATEGORIES: QuestionCategory[] = ["LOCKER", "SPICY", "TIEF"];

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  LOCKER: "Locker",
  SPICY: "Spicy",
  TIEF: "Tief",
};

export const QUESTION_CATALOG: Record<QuestionCategory, string[]> = {
  LOCKER: [
    "Was war dein letztes Guilty-Pleasure-Essen?",
    "Eher Frühaufsteher oder Nachteule?",
    "Welchen Film könntest du endlos wieder schauen?",
    "Strandurlaub oder Städtetrip?",
    "Was ist das Erste, was du morgens machst?",
    "Welches Lied läuft bei dir gerade in Dauerschleife?",
    "Kochen oder bestellen?",
    "Was war dein peinlichstes Outfit als Teenager?",
    "Hund, Katze oder gar kein Haustier?",
    "Welche App öffnest du eindeutig zu oft?",
    "Wie sieht dein perfekter Sonntag aus?",
    "Kaffee, Tee oder beides nicht?",
    "Was kannst du richtig gut, was kaum jemand von dir weiß?",
    "Welches Essen würdest du nie wieder anrühren?",
    "Große Party oder Abend zu zweit?",
    "Was war dein Lieblingsfach in der Schule?",
    "Du hast spontan eine Woche frei – was machst du?",
    "Welche Serie hast du abgebrochen und nie zu Ende geschaut?",
    "Playlist oder Radio im Auto?",
    "Was ist dein liebster Ort in deiner Stadt?",
    "Bist du eher pünktlich oder immer fünf Minuten zu spät?",
    "Was hast du zuletzt zum ersten Mal ausprobiert?",
    "Welches Emoji benutzt du am häufigsten?",
    "Welcher Trend geht dir komplett auf die Nerven?",
    "Süß oder salzig?",
    "Was liegt gerade auf deinem Nachttisch?",
    "Wenn dein Leben einen Titelsong hätte – welcher wäre es?",
    "Worüber hast du zuletzt richtig gelacht?",
  ],
  SPICY: [
    "Was ist dir als Erstes an mir aufgefallen?",
    "Wann hast du das letzte Mal richtig geflirtet?",
    "Was ist für dich ein absolutes No-Go beim ersten Date?",
    "Küssen beim ersten Date – ja oder nein?",
    "Was macht jemanden für dich auf Anhieb anziehend?",
    "Was war dein bestes Date überhaupt?",
    "Welche Eigenschaft an mir überrascht dich am meisten?",
    "Bist du eher der erobernde oder der eroberte Typ?",
    "Was ist dein größter Flirt-Fail?",
    "Wie sieht für dich ein perfekter Abend zu zweit aus?",
    "Was zieht dich mehr an: Selbstbewusstsein oder Humor?",
    "Was ist ein Kompliment, das bei dir immer funktioniert?",
    "Wie lange dauert es bei dir vom Kennenlernen bis zum ersten Kuss?",
    "Gibt es einen Song, bei dem du sofort an jemanden denken musst?",
    "Was wäre für dich ein Dealbreaker, über den andere hinwegsehen würden?",
    "Wann hattest du das letzte Mal Schmetterlinge im Bauch?",
    "Kuscheln auf dem Sofa oder durchtanzte Nacht?",
    "Was ist das Spontanste, was du je für jemanden gemacht hast?",
    "Was hast du beim ersten Treffen wirklich über mich gedacht?",
    "Glaubst du an Liebe auf den ersten Blick?",
    "Wie wichtig ist dir körperliche Nähe im Alltag?",
    "Was bringt dich zum Erröten?",
    "Was ist das Mutigste, was du je jemandem gestanden hast?",
    "Schreibst du zuerst oder wartest du lieber ab?",
    "Woran merkst du, dass du jemanden wirklich magst?",
    "Was ist deine größte Schwäche, der du nicht widerstehen kannst?",
    "Was müsste passieren, damit du dich noch mal richtig verliebst?",
    "Wie sieht dein Typ aus – und passe ich da rein?",
  ],
  TIEF: [
    "Was war der prägendste Moment deines Lebens?",
    "Wann hast du das letzte Mal geweint und warum?",
    "Was bedeutet Familie für dich?",
    "Worauf bist du in deinem Leben wirklich stolz?",
    "Was würdest du deinem 16-jährigen Ich raten?",
    "Welche Entscheidung bereust du am meisten?",
    "Wovor hast du gerade am meisten Angst?",
    "Was brauchst du, um dich bei jemandem sicher zu fühlen?",
    "Wann hast du dich zuletzt richtig einsam gefühlt?",
    "Was möchtest du unbedingt erleben, bevor du alt bist?",
    "Welche Eigenschaft deiner Eltern findest du in dir wieder?",
    "Was fällt dir schwer zuzugeben?",
    "Wie gehst du mit Streit um?",
    "Was wünschst du dir von einer Beziehung, das du bisher nie hattest?",
    "Gibt es jemanden, dem du noch etwas sagen wolltest?",
    "Was gibt deinem Leben gerade Sinn?",
    "Wann hast du dich zuletzt wirklich verstanden gefühlt?",
    "Was ist deine größte Unsicherheit?",
    "Wofür bist du heute dankbar?",
    "Was hat dich in den letzten Jahren am meisten verändert?",
    "Welchen Traum hast du aufgegeben – und warum?",
    "Wie stellst du dir dein Leben in zehn Jahren vor?",
    "Was müsste jemand über dich wissen, um dich wirklich zu verstehen?",
    "Wann hast du das letzte Mal jemandem verziehen?",
    "Was ist für dich echte Nähe?",
    "Wovon träumst du, traust dich aber nicht, es auszusprechen?",
    "Wie schnell schenkst du jemandem dein Vertrauen?",
    "Was war die schwerste Zeit, durch die du gegangen bist?",
  ],
};

/**
 * Draws a question from the selected categories, preferring ones that have not
 * been asked yet. Falls back to the full pool once every question was used.
 */
export function drawRandomQuestion(
  categories: QuestionCategory[],
  alreadyAsked: string[] = []
): string | null {
  const pool = categories.flatMap((category) => QUESTION_CATALOG[category]);
  if (pool.length === 0) return null;

  const used = new Set(alreadyAsked.map((text) => text.trim().toLowerCase()));
  const unused = pool.filter((text) => !used.has(text.toLowerCase()));
  const candidates = unused.length > 0 ? unused : pool;

  return candidates[Math.floor(Math.random() * candidates.length)];
}
