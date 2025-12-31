import {
  BaseFontBackgroundColorPlugin,
  BaseFontColorPlugin,
  BaseFontFamilyPlugin,
  BaseFontSizePlugin,
} from "@platejs/basic-styles";
import { KEYS } from "platejs";

// Target all text-containing elements
const targetPlugins = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.blockquote,
  KEYS.li,
  KEYS.td,
  KEYS.th,
];

export const BaseFontKit = [
  BaseFontColorPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        defaultNodeValue: "black",
        nodeKey: "color",
      },
    },
  }),
  BaseFontBackgroundColorPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        defaultNodeValue: "transparent",
        nodeKey: "backgroundColor",
      },
    },
  }),
  BaseFontSizePlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        nodeKey: "fontSize",
      },
    },
  }),
  BaseFontFamilyPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        nodeKey: "fontFamily",
      },
    },
  }),
];
