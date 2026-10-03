import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import { p } from "./PersonalUI";
export default function PasswordInput({ error, ...props }: TextInputProps & { error?: string }) {
  const input = useRef<TextInput>(null);
  const [visible, setVisible] = useState(false);
  const hadFocus = useRef(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ position: "relative" }}>
      <TextInput {...props} ref={input}
        style={[p.input, props.style, { paddingRight: 58 }]}
        placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false}
        secureTextEntry={!visible} />
      <Pressable accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        accessibilityState={{ disabled: props.editable === false }} disabled={props.editable === false}
        onPressIn={() => { hadFocus.current = input.current?.isFocused() ?? false; }}
        onPress={() => {
          setVisible((current) => !current);
          if (hadFocus.current) requestAnimationFrame(() => input.current?.focus());
        }}
        onPointerDown={(event) => event.preventDefault()}
        style={{ position: "absolute", right: 2, top: 2, bottom: 2, width: 50, minHeight: 46, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={23} color={colors.accent} />
      </Pressable>
      </View>
      {!!error && <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}
