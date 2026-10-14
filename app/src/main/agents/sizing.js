// The right size of model for the job (M15-02). The owner's usage ran out during editing; a request like "make
// this red" does not need the largest model, and a whole new cut of the video does. With "Auto" chosen in the
// chat's model menu, each request is sized here and sent to a smaller model when it is small. The largest jobs
// get the assistant's own default (its best model on the person's plan).

export const AUTO = "auto";

// Words that mark a big job: the whole video, its structure, or a new piece made from it.
const BIG = new RegExp([
  "\\bwhole\\b", "\\bentire\\b", "\\ball (?:the |my )?clips\\b", "\\bevery (?:clip|scene|part)\\b", "\\bfrom scratch\\b",
  "\\bre-?edit", "\\brebuild\\b", "\\bremake\\b", "\\bnew (?:version|cut|video)\\b", "\\b(?:second|third|fourth|fifth) version\\b",
  "\\bmake (?:a|an|the|my) (?:video|vlog|film|short|reel|intro|outro|trailer)\\b", "\\bshorts?\\b", "\\breels?\\b",
  "\\bstoryboard\\b", "\\bplan\\b", "\\bstructure\\b", "\\breorder\\b", "\\brearrange\\b", "\\bsubtitles?\\b", "\\bcaptions?\\b",
].join("|"), "i");
const SMALL_CHARACTERS = 200;

/** Whether a request is a small, local change. `pointing` means the person picked one thing in the picture. */
export function isSmallRequest({ text, mode = "build", pointing = false }) {
  const message = String(text ?? "").trim();
  if (mode !== "build" || !message) return false;
  if (BIG.test(message)) return false;
  return pointing ? message.length <= SMALL_CHARACTERS * 2 : message.length <= SMALL_CHARACTERS;
}

// For a small change, each assistant's smaller model, found by name in the list the assistant itself offers, so a
// renamed or retired model is simply not used. Claude's Sonnet did the whole vlog repair (M15-06), so it is a safe
// floor; Haiku is not used on its own.
const SMALLER = {
  claude: (models) => models.find((model) => model.id === "sonnet"),
  codex: (models) => models.find((model) => /mini/i.test(model.id)),
  antigravity: (models) => models.find((model) => /flash/i.test(model.id) && !/lite/i.test(model.id)) ??
    models.find((model) => /flash/i.test(model.id)),
};

/**
 * The model to run a request on when "Auto" is chosen: `{ model, small }`, where `model` null means the
 * assistant's own default. `models` is the list the assistant offers.
 */
export function sizeModel({ engine, models = [], text, mode, pointing }) {
  const small = isSmallRequest({ text, mode, pointing });
  const smaller = small ? SMALLER[engine]?.(models) : null;
  return { model: smaller?.id ?? null, small: Boolean(smaller) };
}
