/**
 * RUTT – native förar-app (React Native).
 * Steg 1: skalet byggt och installerbart. Härnäst flyttas Opter-inloggningen,
 * namnvalet och ruttoptimeringen in (allt finns redan i JavaScript).
 */
import React from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';

const C = {
  bg: '#1f1d1a',
  panel: '#272420',
  edge: '#3a352f',
  ink: '#efe9e0',
  dim: '#b3a89a',
  accent: '#e8a24c',
  accent2: '#7fb08a',
};

function Row({label, done}: {label: string; done: boolean}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.dot, {color: done ? C.accent2 : C.dim}]}>
        {done ? '●' : '○'}
      </Text>
      <Text style={styles.rowText}>{label}</Text>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.brand}>RUTT</Text>
        <Text style={styles.tagline}>Din förar-app. Native, i mobilen.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bygget</Text>
          <Row label="Native app-skal – byggt och installerbart" done={true} />
          <Row label="Opter-protokoll klart (inloggning, synk, avkodning)" done={true} />
          <Row label="Inloggning + namnval i appen" done={false} />
          <Row label="Dina jobb hämtas direkt från Opter" done={false} />
          <Row label="Ruttoptimering, lastplan och kör-läge" done={false} />
        </View>

        <Text style={styles.foot}>
          Första bygget. Nästa pass flyttar jag in Opter-inloggningen och
          optimeraren – allt finns redan som JavaScript.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: C.bg},
  wrap: {padding: 22, paddingTop: 36},
  brand: {
    color: C.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
  },
  tagline: {color: C.dim, fontSize: 15, marginTop: 4, marginBottom: 26},
  card: {
    backgroundColor: C.panel,
    borderColor: C.edge,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: {color: C.accent, fontSize: 13, fontWeight: '700', marginBottom: 12},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 7},
  dot: {fontSize: 14, width: 22},
  rowText: {color: C.ink, fontSize: 15, flex: 1},
  foot: {color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 22},
});

export default App;
