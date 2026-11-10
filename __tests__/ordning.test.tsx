/* 3.68: flytta stopp – pilar och "gör till nästa", och listan hoppar inte tillbaka när planen räknas om. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {SafeAreaProvider} from 'react-native-safe-area-context';
import ReorderSheet from '../src/ui/Reorder';
const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const mk = () => [
  {key: 'd1', kind: 'drop', cid: '1', st: {who: 'Fräsens Måleri'}, plan: null},
  {key: 'p2', kind: 'pickup', cid: '2', st: {who: 'Nordsjö Västberga'}, plan: null},
  {key: 'd3', kind: 'drop', cid: '3', st: {who: 'Retur Bygg-Olle'}, plan: null},
] as any;
const byLabel = (r: any, l: string) => r.root.findAll((n: any) => n.props && n.props.accessibilityLabel === l && typeof n.props.onPress === 'function');
test('pil ner, siffran = nästa, och spara ger den ordningen', () => {
  const save = jest.fn();
  let r: any;
  const el = (items: any) => <SafeAreaProvider initialMetrics={M}><ReorderSheet open items={items} manual={false} onClose={() => {}} onSave={save} /></SafeAreaProvider>;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(el(mk())); });
  ReactTestRenderer.act(() => { byLabel(r, 'Flytta ner')[0].props.onPress(); });          // d1 ner ett steg → p2, d1, d3
  ReactTestRenderer.act(() => { r.update(el(mk())); });                                      // planen räknas om (nya objekt) – ska inte nollställa
  ReactTestRenderer.act(() => { byLabel(r, 'Gör till nästa stopp')[2].props.onPress(); }); // d3 först → d3, p2, d1
  const spara = r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function' && n.findAll((m: any) => m.props && m.props.children === 'Spara').length).pop();
  ReactTestRenderer.act(() => { spara.props.onPress(); });
  expect(save).toHaveBeenCalledWith(['d3', 'p2', 'd1']);
});
