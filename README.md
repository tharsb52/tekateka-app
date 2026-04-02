# TekaTeka - Business Management App for African Merchants

**TekaTeka** is a mobile-first business management application designed specifically for small merchants in Africa. It provides a simple, intuitive interface for managing products, recording sales, tracking expenses, and monitoring business performance.

## 🌟 Features

### 1. **Multi-Language Support**
- **French** (Default)
- **Lingala**
- **English**

### 2. **Authentication**
- Phone number-based registration
- Mock OTP verification (displays code in console and on-screen for MVP)
- Secure user session management
- Data synced across devices using phone number as identifier

### 3. **Product Management**
- Add, edit, and delete products
- Track product details:
  - Name
  - Price
  - Stock quantity
  - Category (Food, Drinks, Clothes, Cosmetics, Electronics, Other)
- Low stock alerts on dashboard

### 4. **Sales Recording**
- Quick product selection interface
- Quantity adjustment with +/- buttons
- Multiple payment methods:
  - Cash
  - Mobile Money
- Multi-currency support:
  - USD ($)
  - CFA Franc (FCFA)
  - Congolese Franc (FC)
- Automatic revenue calculation
- Automatic stock deduction

### 5. **Expense Tracking**
- Predefined expense categories:
  - Inventory purchase
  - Transport
  - Rent
  - Electricity
  - Water
  - Internet
  - Salaries
  - Mobile Money fees
  - Taxes
  - Maintenance/Repairs
  - Supplies
  - Miscellaneous
- Custom expense categories
- Notes field for additional details

### 6. **Dashboard & Analytics**
- **Total Sales** - Track all revenue
- **Total Expenses** - Monitor spending
- **Net Profit** - Visual indicator (Green for profit, Red for loss)
- **Top Selling Products** - See your best performers
- **Low Stock Alerts** - Never run out of popular items
- **Trial Period Tracker** - 7-day free trial countdown

### 7. **Offline-First Architecture**
- All data stored locally using AsyncStorage
- Works without internet connection
- Cloud sync ready (MongoDB backend)
- Data persists across app restarts

### 8. **Subscription System** (MVP)
- 7-day free trial
- Mock subscription flow
- Ready for Mobile Money integration (MTN, Orange Money, M-Pesa)

## 🎨 Design Principles

- **Mobile-First**: Optimized for small screens and touch interaction
- **Large Touch Targets**: Minimum 48px for easy tapping
- **High Contrast**: Easy to read in bright sunlight
- **Simple Navigation**: Bottom tab bar for quick access
- **Minimal Text**: Icon-driven interface
- **Accessible**: Simple language suitable for non-tech users
- **Lightweight**: Optimized for low-end devices

## 🛠️ Tech Stack

### Frontend
- **Expo** (React Native) - Cross-platform mobile framework
- **Expo Router** - File-based routing
- **TypeScript** - Type safety
- **AsyncStorage** - Local data persistence
- **i18n-js** - Internationalization
- **date-fns** - Date formatting
- **Expo Vector Icons** - Icon library

### Backend (Ready for Integration)
- **FastAPI** - Python backend framework
- **MongoDB** - Cloud database
- **Motor** - Async MongoDB driver

## 📱 App Structure

```
/app/frontend/
├── app/
│   ├── (tabs)/
│   │   ├── dashboard.tsx      # Main dashboard with statistics
│   │   ├── sell.tsx           # Quick sell interface
│   │   ├── products.tsx       # Product management
│   │   ├── expenses.tsx       # Expense tracking
│   │   └── _layout.tsx        # Tab navigation
│   ├── index.tsx              # Entry point & auth
│   └── _layout.tsx            # Root layout with providers
├── components/
│   └── LoginScreen.tsx        # Authentication screen
├── context/
│   ├── AuthContext.tsx        # User authentication state
│   └── DataContext.tsx        # Products, sales, expenses data
├── i18n/
│   └── translations.ts        # Multi-language translations
├── types/
│   └── index.ts               # TypeScript interfaces
└── utils/
    ├── currencies.ts          # Currency formatting
    ├── i18n.ts                # i18n configuration
    └── storage.ts             # AsyncStorage helpers
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Yarn or npm
- Expo CLI
- iOS Simulator or Android Emulator (optional)

### Installation

1. **Install dependencies:**
```bash
cd /app/frontend
yarn install
```

2. **Start the development server:**
```bash
yarn start
```

3. **Test the app:**
- **Web**: Open https://low-data-shop.preview.emergentagent.com
- **Mobile**: Scan QR code with Expo Go app

### Testing the App

1. **Login:**
   - Enter any phone number (e.g., 243123456789)
   - Click "Envoyer le code"
   - A mock OTP will appear in a yellow box
   - Enter the 4-digit code
   - Click "Vérifier le code"

2. **Add Products:**
   - Navigate to "Produits" tab
   - Click the + button
   - Fill in product details
   - Save

3. **Record Sales:**
   - Navigate to "Vendre" tab
   - Select a product
   - Adjust quantity
   - Choose payment method
   - Select currency
   - Click "Enregistrer la vente"

4. **Track Expenses:**
   - Navigate to "Charges" tab
   - Click the + button
   - Select or create expense category
   - Enter amount
   - Save

5. **View Dashboard:**
   - Navigate to "Tableau de bord"
   - See sales, expenses, and profit
   - View top-selling products
   - Check low stock alerts

## 🌍 Multi-Currency Support

The app supports three currencies with automatic formatting:

- **USD**: $1,234.50
- **CFA Franc**: 1 234 FCFA
- **Congolese Franc**: 1 234 FC

Users can switch currencies on the sell screen for international transactions.

## 📊 Data Storage

### Local Storage (AsyncStorage)
All data is stored locally in the following keys:
- `@tekateka:user` - User profile
- `@tekateka:products` - Product inventory
- `@tekateka:sales` - Sales history
- `@tekateka:expenses` - Expense records

### Cloud Sync (Ready for Implementation)
The app is designed with cloud sync in mind:
- Phone number as unique identifier
- Sync mechanism ready in DataContext
- MongoDB backend prepared
- Conflict resolution (last-write-wins)

## 🔐 Security

- Phone number-based authentication
- Mock OTP for MVP (ready for Africa's Talking integration)
- User data isolation
- Secure local storage

## 🎯 Roadmap

### Phase 1: MVP (Current)
- ✅ Authentication with mock OTP
- ✅ Product management
- ✅ Sales recording
- ✅ Expense tracking
- ✅ Dashboard analytics
- ✅ Multi-language support
- ✅ Multi-currency support
- ✅ Offline-first architecture

### Phase 2: Enhancement
- [ ] Real SMS OTP (Africa's Talking integration)
- [ ] Cloud data synchronization
- [ ] Mobile Money payment integration
- [ ] Receipt generation
- [ ] Export data (CSV, PDF)
- [ ] Push notifications

### Phase 3: Advanced Features
- [ ] Multi-user support (employees)
- [ ] Advanced analytics
- [ ] Inventory predictions
- [ ] Customer management
- [ ] Barcode scanning
- [ ] Photo uploads for products

## 🤝 Contributing

This is an MVP built for African merchants. Feedback and contributions are welcome!

## 📄 License

MIT License

## 🙏 Acknowledgments

Built with love for African entrepreneurs who are building their businesses every day.

---

**TekaTeka** - *Teka na bizaleli* (Sell with confidence) 🇨🇩🇨🇲🇨🇮
