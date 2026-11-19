/**
 * Drop-in replacements for react-native's Text, TextInput and Alert that
 * follow the app language (see utils/translate.ts). All screens import these
 * instead of the react-native originals.
 */
import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  Alert as RNAlert,
  TextProps,
  TextInputProps,
  AlertButton,
  AlertOptions,
} from 'react-native';
import { tr, trChildren, useLocale } from '../utils/translate';

export const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>((props, ref) => {
  useLocale();
  return <RNText ref={ref} {...props}>{trChildren(props.children)}</RNText>;
});
Text.displayName = 'Text';

export const TextInput = React.forwardRef<React.ElementRef<typeof RNTextInput>, TextInputProps>((props, ref) => {
  useLocale();
  return <RNTextInput ref={ref} {...props} placeholder={tr(props.placeholder)} />;
});
TextInput.displayName = 'TextInput';

export const Alert = {
  alert: (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) =>
    RNAlert.alert(
      tr(title),
      tr(message),
      buttons?.map((b) => ({ ...b, text: tr(b.text) })),
      options,
    ),
  prompt: RNAlert.prompt,
};
