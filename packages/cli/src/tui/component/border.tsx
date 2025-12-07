import type { BorderCharacters } from "@opentui/core"

export const EmptyBorder: BorderCharacters = {
  topLeft: " ",
  topRight: " ",
  bottomLeft: " ",
  bottomRight: " ",
  horizontal: " ",
  vertical: " ",
  topT: " ",
  bottomT: " ",
  leftT: " ",
  rightT: " ",
  cross: " ",
}

export const LeftBorder: BorderCharacters = {
  ...EmptyBorder,
  vertical: "┃",
}

export const LeftBorderWithCorner: BorderCharacters = {
  ...LeftBorder,
  bottomLeft: "╹",
}
