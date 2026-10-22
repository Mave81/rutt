/*
 * Typsnittet i hela RUTT: Barlow (läsbart i farten, i samma stil som vägskyltar).
 * All Text och TextInput får Barlow som standard. Text inuti annan Text ärver förälderns typsnitt (som vanligt).
 * Rubriker kan välja 'BarlowCond' (Semi Condensed) och nummer 'PlexMono' själva.
 * Typsnitten registreras i MainApplication.kt (res/font/*.xml) så fontWeight 400–700 väljer rätt fil.
 */
const React = require('react');
const TM = require('react-native/Libraries/Text/Text');
const TIM = require('react-native/Libraries/Components/TextInput/TextInput');
const Ctx = require('react-native/Libraries/Text/TextAncestorContext').default;

export const FONT = {body: 'Barlow', cond: 'BarlowCond', mono: 'PlexMono'};
const BASE = {fontFamily: FONT.body};
let patched = false;
export function patchFonts() {
  if (patched) return; patched = true;
  try {
    const OrigText = TM.default;
    const BText = (props) => {
      const inText = React.useContext(Ctx);
      return React.createElement(OrigText, inText ? props : {...props, style: props.style ? [BASE, props.style] : BASE});
    };
    BText.displayName = 'Text';
    TM.default = BText;
    const OrigInput = TIM.default;
    const BInput = (props) => React.createElement(OrigInput, {...props, style: props.style ? [BASE, props.style] : BASE});
    BInput.displayName = 'TextInput';
    Object.keys(OrigInput).forEach(k => { try { BInput[k] = OrigInput[k]; } catch (e) {} }); // State m.m.
    TIM.default = BInput;
  } catch (e) {}
}
patchFonts();
