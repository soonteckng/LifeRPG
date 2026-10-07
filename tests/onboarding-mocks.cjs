// Existing account/service regressions use this boundary. The separate
// onboarding-flow suite exercises the real frame and animation lifecycle.
exports.frame = React => ({
  __esModule: true,
  default: props => React.createElement('Frame', props, props.children,
    React.createElement('Footer', null,
      props.error && React.createElement('Text', null, props.error),
      React.createElement('Button', { disabled: props.busy, onPress: props.onNext, accessibilityLabel: props.primary }, props.primary),
      props.onBack && React.createElement('Button', { onPress: props.onBack, accessibilityLabel: 'Previous step' }, 'Back'),
      props.onSecondary && React.createElement('Button', { onPress: props.onSecondary, accessibilityLabel: props.secondary }, props.secondary))),
  OnboardingChoice: props => React.createElement('Button', { onPress: props.onPress, accessibilityLabel: props.title }, props.title),
  useOnboardingTransition: () => ({ opacity: 1, moving: false, change: action => action() }),
});
exports.finish = React => ({ __esModule: true, default: props => { React.useEffect(() => { props.onDone(); }, [props.onDone]); return React.createElement('Finish'); } });
