import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SmartDatePicker } from './SmartDatePicker';
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
describe('web custom dates', () => {
 const original = Platform.OS;
 beforeEach(() => { Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true }); });
 afterEach(() => { Object.defineProperty(Platform, 'OS', { value: original, configurable: true }); });
 function open(onChangeDate = jest.fn(), minimumDate?: Date) { const ui = render(<SmartDatePicker label="Bill date" value="2026-11-07" onChangeDate={onChangeDate} minimumDate={minimumDate}/>); fireEvent.press(ui.getByLabelText('Bill date')); fireEvent.press(ui.getByLabelText('Choose a custom date')); return { ...ui, onChangeDate }; }
 it('keeps accessible date entry open and applies an historical date', () => { const ui = open(); fireEvent.changeText(ui.getByLabelText('Custom date (YYYY-MM-DD)'), '2026-10-04'); fireEvent.press(ui.getByLabelText('Confirm selected date')); expect(ui.onChangeDate).toHaveBeenCalledWith('2026-10-04'); });
 it('rejects invalid calendar dates and dates before minimum', () => { const ui = open(jest.fn(), new Date('2026-10-01T12:00:00')); fireEvent.changeText(ui.getByLabelText('Custom date (YYYY-MM-DD)'), '2026-02-30'); fireEvent.press(ui.getByLabelText('Confirm selected date')); expect(ui.onChangeDate).not.toHaveBeenCalled(); expect(ui.getByRole('alert')).toBeTruthy(); fireEvent.changeText(ui.getByLabelText('Custom date (YYYY-MM-DD)'), '2026-09-30'); fireEvent.press(ui.getByLabelText('Confirm selected date')); expect(ui.onChangeDate).not.toHaveBeenCalled(); });
});
