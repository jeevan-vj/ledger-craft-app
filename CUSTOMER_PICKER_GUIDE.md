# Customer Picker Implementation Guide

## ✅ Component Created: CustomerPicker

**File:** `mobile/src/components/customers/CustomerPicker.tsx`

### Features Implemented:

1. **Modal Presentation** - Full-screen modal with native feel
2. **Search Functionality** - Real-time search by name, email, or phone
3. **Create New Customer** - Inline form to create customer without leaving
4. **Customer List** - Shows all customers with avatars (initials)
5. **Selection Feedback** - Visual indication of selected customer
6. **Form Validation** - Validates required fields and email format
7. **Loading States** - Shows spinner while loading data
8. **Empty States** - Helpful messages when no customers exist

### UI Features:
- ✅ Revolut-style blue gradient for selected items
- ✅ Avatar with initials for each customer
- ✅ Search bar at top
- ✅ "Create New Customer" prominent button
- ✅ Inline create form with cancel/create actions
- ✅ Customer info display (name, email, location)
- ✅ Check mark for selected customer

## 🔌 How to Integrate into InvoiceCreateScreen

### Step 1: Import the Component

```typescript
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { Customer } from '@/services/customerService';
```

### Step 2: Add State

```typescript
const [showCustomerPicker, setShowCustomerPicker] = useState(false);
const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
```

### Step 3: Replace Customer Input with Touchable

Replace your current customer input with:

```typescript
<TouchableOpacity
  onPress={() => setShowCustomerPicker(true)}
  className="bg-white border border-gray-300 rounded-xl px-4 py-3 mb-4"
>
  <Text className="text-gray-500 text-xs mb-1">Customer</Text>
  <Text className="text-base text-gray-900">
    {selectedCustomer ? selectedCustomer.name : 'Select Customer'}
  </Text>
</TouchableOpacity>
```

### Step 4: Add the Picker Component

Add at the bottom of your render:

```typescript
<CustomerPicker
  visible={showCustomerPicker}
  onSelect={(customer) => {
    setSelectedCustomer(customer);
    // Update your invoice form data
    setInvoiceData({
      ...invoiceData,
      customerId: customer.id
    });
  }}
  onClose={() => setShowCustomerPicker(false)}
  selectedCustomerId={selectedCustomer?.id}
/>
```

## 📱 Complete Integration Example

```typescript
export default function InvoiceCreateScreen() {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: 'INV-0001',
    customerId: '',
    date: new Date().toISOString(),
    dueDate: '',
    // ... other fields
  });

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Invoice Details Card */}
      <View className="bg-white rounded-2xl p-4 m-4">
        <Text className="text-xl font-bold mb-4">Invoice Details</Text>
        
        {/* Invoice Number */}
        <FormInput
          label="Invoice Number"
          value={invoiceData.invoiceNumber}
          onChangeText={(text) => setInvoiceData({...invoiceData, invoiceNumber: text})}
        />

        {/* Customer Picker Button */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 mb-1.5">
            Customer <Text className="text-red-500">*</Text>
          </Text>
          <TouchableOpacity
            onPress={() => setShowCustomerPicker(true)}
            className="bg-white border border-gray-300 rounded-xl px-4 py-3"
            activeOpacity={0.7}
          >
            {selectedCustomer ? (
              <View className="flex-row items-center">
                <View className="bg-revolut-blue-100 w-8 h-8 rounded-full items-center justify-center mr-2">
                  <Text className="text-revolut-blue-700 text-xs font-bold">
                    {selectedCustomer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base text-gray-900 font-medium">
                    {selectedCustomer.name}
                  </Text>
                  {selectedCustomer.email && (
                    <Text className="text-xs text-gray-500">{selectedCustomer.email}</Text>
                  )}
                </View>
                <Text className="text-revolut-blue-600">Change</Text>
              </View>
            ) : (
              <Text className="text-gray-400">Tap to select customer</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Date fields, etc. */}
      </View>

      {/* Customer Picker Modal */}
      <CustomerPicker
        visible={showCustomerPicker}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          setInvoiceData({
            ...invoiceData,
            customerId: customer.id
          });
        }}
        onClose={() => setShowCustomerPicker(false)}
        selectedCustomerId={selectedCustomer?.id}
      />
    </ScrollView>
  );
}
```

## 🎨 Styling Matches

The CustomerPicker follows the same Revolut-style design as your dashboard:
- Blue gradient accents (#5B72EE)
- White card backgrounds
- Rounded corners (rounded-xl)
- Consistent padding and spacing
- Touch-friendly sizes (44x44 minimum)
- Native modal presentation

## ⚡ Features

### Search
- Real-time filtering as you type
- Searches name, email, and phone
- Case-insensitive

### Create New
- Button at top of list
- Inline form (no navigation away)
- Validates required fields
- Validates email format
- Returns newly created customer automatically

### Selection
- Visual feedback with blue border
- Check mark indicator
- Shows customer avatar
- Displays name, email, and location

## 🔄 Data Flow

1. User taps "Customer" field
2. CustomerPicker modal opens
3. User can either:
   - Search and select existing customer
   - Tap "Create New Customer"
   - Fill form and tap "Create"
4. Modal closes and returns selected customer
5. Invoice form updates with customer info

## 🚀 Ready to Use!

The CustomerPicker is production-ready and can be used in:
- ✅ Invoice Create Screen
- ✅ Invoice Edit Screen
- ✅ Any screen that needs customer selection

Just import, add state, and connect the callbacks!

