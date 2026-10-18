import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ModernInput } from './ModernInput';

describe('ModernInput accessibility', () => {
  it('exposes its visible label and error to assistive technology', () => {
    const onChangeText = jest.fn();
    const { getByLabelText, getByText } = render(
      <ModernInput
        label="Email address"
        value=""
        onChangeText={onChangeText}
        error="Enter a valid email"
      />,
    );

    fireEvent.changeText(getByLabelText('Email address'), 'owner@example.com');
    expect(onChangeText).toHaveBeenCalledWith('owner@example.com');
    expect(getByText('Enter a valid email')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('labels the password visibility control', () => {
    const { getByLabelText } = render(
      <ModernInput
        label="Password"
        value="secret123"
        onChangeText={jest.fn()}
        secureTextEntry
        showPasswordToggle
      />,
    );

    expect(getByLabelText('Show password')).toHaveProp('accessibilityRole', 'button');
  });
});
