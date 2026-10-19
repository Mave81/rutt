// Bootstrap Icons (icons.getbootstrap.com) som typsnitt: android/app/src/main/assets/fonts/bootstrap-icons.ttf
import React from 'react';
import {Text, TextStyle} from 'react-native';
const MAP = {"alarm-fill":61697,"telephone-fill":62900,"chat-dots-fill":62025,"chat-text-fill":62054,"geo-alt-fill":62439,"cursor-fill":62177,"check-circle-fill":62058,"check2":62066,"check2-all":62063,"box-seam":61895,"box-seam-fill":63443,"truck":62954,"clock":62099,"clock-fill":62097,"person-fill":62682,"building":61917,"broadcast":61910,"geo-fill":62441,"person-check-fill":62677,"wifi-off":63003,"exclamation-triangle-fill":62266,"exclamation-circle-fill":62258,"x-circle-fill":63010,"arrow-counterclockwise":61719,"chevron-right":62085,"chevron-double-right":62080,"chevron-down":62082,"chevron-up":62086,"grid-3x3-gap-fill":62456,"chat-left-text-fill":62033,"bell-fill":61833,"moon-stars-fill":62613,"sun-fill":62881,"circle-half":62088,"gear-fill":62434,"info-circle":62513,"key-fill":62542,"plus-lg":63053,"camera-fill":61977,"pen-fill":62663,"cup-hot-fill":63466,"stopwatch-fill":62870,"inbox-fill":62508,"send-fill":63161,"three-dots":62932,"x-lg":63065,"clipboard-check-fill":63259,"house-door-fill":62498,"signpost-2-fill":62789,"calendar-event":61928,"arrow-repeat":61744,"power":62719,"cloud-check-fill":62104,"cloud-arrow-up-fill":62102,"megaphone-fill":62595,"share-fill":62765,"cloud-slash-fill":62135,"speedometer2":62848,"p-square-fill":63494,"list-ul":62584,"circle":62090,"input-cursor-text":62517,"person-x-fill":62687,"check-square-fill":62060,"square":62852,"chevron-left":62084,"images":62507,"plus-circle-fill":62713,"lock-fill":62586,"eye-fill":62270,"pencil-square":62666,"headset":62484,"star-fill":62854,"person-plus-fill":62684,"person-lines-fill":62683,"wrench":63009,"box-arrow-up-right":61893,"people-fill":62671,"eye":62273,"eye-slash":62272,"play-circle":62707,"shield-lock":62776} as const;
export type BiName = keyof typeof MAP;
export function Bi({n, size = 18, color, style}: {n: BiName; size?: number; color?: string; style?: TextStyle | TextStyle[]}) {
  return (
    <Text allowFontScaling={false} style={[{fontFamily: 'bootstrap-icons', fontSize: size, lineHeight: size * 1.1, color, includeFontPadding: false, textAlignVertical: 'center'} as TextStyle, style as any]}>
      {String.fromCharCode(MAP[n])}
    </Text>
  );
}
