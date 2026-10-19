/**
 * Bild eller PDF i helskärm (från Jobbet-chatten eller Dela → RUTT).
 * PDF visas som sidor (ritade av telefonen). "Förstora" = dubbel bredd, dra i sidled för att läsa det finstilta.
 */
import React, {useEffect, useState} from 'react';
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed} from './theme';
import {Bi} from './Bi';

export type Media = {kind: 'image' | 'pdf'; uri: string; name?: string; pages?: number; pageUris?: string[]};

function Page({uri, w}: {uri: string; w: number}) {
  const [ratio, setRatio] = useState(1.414);
  useEffect(() => { Image.getSize(uri, (a, b) => { if (a && b) setRatio(b / a); }, () => {}); }, [uri]);
  return <Image source={{uri}} style={{width: w, height: w * ratio, backgroundColor: '#FFFFFF', marginBottom: 8}} resizeMode="contain" />;
}

export default function MediaViewer({media, title, onClose, action}: {media: Media | null; title?: string; onClose: () => void; action?: {label: string; icon: any; onPress: () => void}}) {
  const {width} = useWindowDimensions();
  const ins = useSafeAreaInsets();
  const [big, setBig] = useState(false);
  useEffect(() => { setBig(false); }, [media && media.uri]);
  if (!media) return null;
  const pages = media.kind === 'pdf' ? media.pageUris || [] : [media.uri];
  const w = big ? width * 2 : width;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[v.root, {paddingTop: ins.top}]}>
        <View style={v.bar}>
          <Pressable hitSlop={12} onPress={onClose} style={v.ib}><Bi n="x-lg" size={20} color={C.ink} /></Pressable>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={v.t} numberOfLines={1}>{title || media.name || (media.kind === 'pdf' ? 'PDF' : 'Bild')}</Text>
            {media.kind === 'pdf' ? <Text style={v.s}>{media.pages || pages.length} {(media.pages || pages.length) === 1 ? 'sida' : 'sidor'}{media.pages && media.pages > pages.length ? ` · visar ${pages.length} första` : ''}</Text> : null}
          </View>
          <Pressable onPress={() => setBig(b => !b)} style={v.zb}><Bi n={big ? 'zoom-out' : 'zoom-in'} size={16} color={C.ink} /><Text style={v.zt}>{big ? 'Mindre' : 'Förstora'}</Text></Pressable>
        </View>
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: ins.bottom + (action ? 90 : 20)}}>
          <ScrollView horizontal scrollEnabled={big} showsHorizontalScrollIndicator={big}>
            <View style={{width: w}}>
              {pages.length ? pages.map(u => <Page key={u} uri={u} w={w} />) : <Text style={[v.s, {padding: 20}]}>Kunde inte visa filen.</Text>}
            </View>
          </ScrollView>
        </ScrollView>
        {action ? (
          <View style={[v.dock, {paddingBottom: ins.bottom + 12}]}>
            <Pressable style={v.act} onPress={action.onPress} android_ripple={{color: C.edge}}>
              <Bi n={action.icon} size={18} color={C.onAccent} /><Text style={v.actT}>{action.label}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const v = themed(() => StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  bar: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10},
  ib: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel},
  t: {color: C.ink, fontSize: 16, fontWeight: '800'},
  s: {color: C.dim, fontSize: 12.5, marginTop: 1},
  zb: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12},
  zt: {color: C.ink, fontSize: 13, fontWeight: '700'},
  dock: {position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.bg},
  act: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15},
  actT: {color: C.onAccent, fontSize: 16, fontWeight: '900'},
}));
