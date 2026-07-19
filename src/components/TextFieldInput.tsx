import React, { useRef, useState } from 'react';
import {
  Animated, TextInput, TextInputProps, Text,
  View, StyleSheet, ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/fonts';
import { radii, spacing } from '../theme/spacing';

interface TextFieldInputProps extends TextInputProps {
  label: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}

export function TextFieldInput({
  label,
  error,
  containerStyle,
  onFocus,
  onBlur,
  value,
  ...rest
}: TextFieldInputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(0)).current;

  const isFloating = isFocused || (typeof value === 'string' && value.length > 0);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    Animated.timing(labelAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (!value || (typeof value === 'string' && value.length === 0)) {
      Animated.timing(labelAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    }
    onBlur?.(e);
  };

  React.useEffect(() => {
    Animated.timing(labelAnim, {
      toValue: isFloating ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [isFloating]);

  const borderColor = error ? colors.danger : isFocused ? colors.purple : colors.border;
  const borderWidth = isFocused && !error ? 2 : 1;
  const labelFontSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 11] });
  const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -8] });
  const labelColor = error ? colors.danger : isFocused ? colors.purple : colors.textFaint;

  return (
    <View style={[styles.container, containerStyle]}>
      <Animated.Text
        style={[
          styles.label,
          {
            fontSize: labelFontSize,
            top: labelTop,
            color: labelColor,
            backgroundColor: isFloating ? colors.surface : 'transparent',
            paddingHorizontal: isFloating ? 4 : 0,
          },
        ]}
      >
        {label}
      </Animated.Text>
      <View
        style={[
          styles.inputContainer,
          {
            borderColor,
            borderWidth,
            backgroundColor: colors.surface,
            ...(isFocused && !error ? {
              shadowColor: colors.purple,
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 4,
            } : {}),
          },
        ]}
      >
        <TextInput
          {...rest}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.input, { color: colors.textPrimary }, rest.style]}
          placeholderTextColor={colors.textFainter}
        />
      </View>
      {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12, paddingTop: 8 },
  label: { position: 'absolute', left: spacing.lg, zIndex: 1, fontFamily: fonts.medium },
  inputContainer: { minHeight: 52, borderRadius: radii.md, justifyContent: 'center' },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: 8,
    minHeight: 52,
  },
  errorText: { fontSize: 12, marginTop: 4, marginLeft: spacing.lg },
});
