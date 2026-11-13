'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  Printer,
  X,
  CreditCard,
  ArrowLeft,
  Smartphone,
  Banknote,
  Building,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatETB } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';

interface CartItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
  maxStock: number;
}

export default function PosPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Checkout & Receipt Modal states
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'BANK_TRANSFER'>('CASH');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentRef, setPaymentRef] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

  // Mobile cart sheet toggle
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Load products & categories from NestJS backend
  const loadCatalog = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        api.get('/api/v1/products'),
        api.get('/api/v1/products/categories'),
      ]);
      setProducts(prodRes.data);
      setCategories(catRes.data);
    } catch (err) {
      console.error('Failed to load POS catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filter products by category & search
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q));
    return matchesCat && matchesQuery;
  });

  // Cart operations
  const addToCart = (product: any) => {
    const onHand = Number(product.inventory?.quantityOnHand || 0);
    if (onHand <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= onHand) return prev;
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          sellingPrice: Number(product.sellingPrice),
          costPrice: Number(product.costPrice),
          quantity: 1,
          maxStock: onHand,
        },
      ];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (nextQty > item.maxStock) return item;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => setCart([]);

  // Totals
  const subtotal = cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const taxRate = 0.15;
  const taxAmount = subtotal - subtotal / (1 + taxRate);
  const totalAmount = subtotal;

  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setAmountPaid(totalAmount);
    setIsCheckoutOpen(true);
  };

  const handleCompleteSale = async () => {
    setCheckoutLoading(true);
    try {
      const payload = {
        items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
        paymentMethod,
        amountPaid: amountPaid || totalAmount,
        paymentReference: paymentRef || undefined,
      };

      const res = await api.post('/api/v1/sales/checkout', payload);
      setCompletedSale(res.data);
      setIsCheckoutOpen(false);
      clearCart();
      setIsMobileCartOpen(false);
      loadCatalog();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans">
      {/* POS Top Navbar */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Point of Sale</span>
              <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Live POS
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Addis Supermarket • Cashier Mode
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />

          {/* Mobile Cart Trigger */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMobileCartOpen(true)}
            className="lg:hidden relative p-2.5 rounded-xl bg-emerald-600 text-white font-medium flex items-center gap-2 shadow-sm"
          >
            <ShoppingCart className="w-5 h-5" />
            {cart.length > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center"
              >
                {cart.reduce((sum, i) => sum + i.quantity, 0)}
              </motion.span>
            )}
          </motion.button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Product Catalog & Search */}
        <section className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 overflow-y-auto">
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search products by name, SKU, or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              All Items ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No products found</p>
              <p className="text-xs text-slate-400 mt-1">Try another search term or category.</p>
            </div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
            >
              <AnimatePresence>
                {filteredProducts.map((p) => {
                  const onHand = Number(p.inventory?.quantityOnHand || 0);
                  const isOutOfStock = onHand <= 0;
                  const isLowStock = onHand > 0 && onHand <= Number(p.minStockThreshold);

                  return (
                    <motion.button
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      whileHover={!isOutOfStock ? { y: -3, transition: { duration: 0.15 } } : {}}
                      whileTap={!isOutOfStock ? { scale: 0.97 } : {}}
                      key={p.id}
                      disabled={isOutOfStock}
                      onClick={() => addToCart(p)}
                      className={`p-4 rounded-2xl text-left flex flex-col justify-between border transition-shadow ${
                        isOutOfStock
                          ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                            {p.sku}
                          </span>
                          {isOutOfStock ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                              Out
                            </span>
                          ) : isLowStock ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                              Low: {onHand}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">
                              {onHand} {p.unit}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                          {p.name}
                        </h3>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-baseline justify-between">
                        <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {formatETB(p.sellingPrice)}
                        </span>
                        <span className="text-[10px] text-slate-400">/{p.unit}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </section>

        {/* Right Column: Checkout Cart */}
        <aside
          className={`fixed lg:static top-0 bottom-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-xl lg:shadow-none transition-transform duration-300 ease-in-out ${
            isMobileCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Cart Header */}
          <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <span>Current Order</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {cart.reduce((sum, i) => sum + i.quantity, 0)} items
              </span>
            </div>

            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 font-semibold px-2 py-1 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="p-2 rounded-lg text-slate-500 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cart Items List with AnimatePresence */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <ShoppingCart className="w-12 h-12 stroke-1 mb-2 opacity-50" />
                <p className="font-semibold text-sm">Cart is empty</p>
                <p className="text-xs mt-1">Tap products on the left to add items.</p>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map((item) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatETB(item.sellingPrice)} × {item.quantity}
                        </p>
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        {formatETB(item.sellingPrice * item.quantity)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Cart Pricing Summary */}
          <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
            <div className="space-y-1.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal</span>
                <span>{formatETB(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>VAT (15% inclusive)</span>
                <span>{formatETB(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Total Due</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  {formatETB(totalAmount)}
                </span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={cart.length === 0}
              onClick={handleOpenCheckout}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm sm:text-base shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              <span>Charge {formatETB(totalAmount)}</span>
            </motion.button>
          </div>
        </aside>
      </div>

      {/* Payment Selection Modal with Framer Motion */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                    Select Payment Method
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total Payable:{' '}
                    <strong className="text-emerald-600 font-bold">{formatETB(totalAmount)}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setIsCheckoutOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Payment Method Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash', icon: Banknote },
                    { id: 'TELEBIRR', label: 'Telebirr', icon: Smartphone },
                    { id: 'CBE_BIRR', label: 'CBE Birr', icon: Building },
                    { id: 'BANK_TRANSFER', label: 'Transfer', icon: CreditCard },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 font-semibold text-xs transition-all ${
                          paymentMethod === m.id
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{m.label}</span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Quick Cash Presets */}
                {paymentMethod === 'CASH' && (
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Quick Cash Presets (ETB)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[100, 200, 500, 1000].map((preset) => (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          key={preset}
                          onClick={() => setAmountPaid(preset)}
                          className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors"
                        >
                          {preset} ETB
                        </motion.button>
                      ))}
                    </div>

                    <div className="pt-2">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Amount Tendered (ETB)
                      </label>
                      <input
                        type="number"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                        className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold text-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {amountPaid > totalAmount && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex justify-between font-bold"
                      >
                        <span>Change Due to Customer:</span>
                        <span className="text-sm">{formatETB(amountPaid - totalAmount)}</span>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Transaction reference */}
                {paymentMethod !== 'CASH' && (
                  <div className="pt-2">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Transaction / Confirmation Reference
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Telebirr TXN12345678"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="w-full mt-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={checkoutLoading || (paymentMethod === 'CASH' && amountPaid < totalAmount)}
                  onClick={handleCompleteSale}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all flex items-center gap-2"
                >
                  {checkoutLoading ? (
                    <span>Processing...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Complete Sale</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Printable Receipt Modal with Framer Motion */}
      <AnimatePresence>
        {completedSale && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-sm text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Sale Completed
                </span>
                <button
                  onClick={() => setCompletedSale(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Thermal Receipt Layout */}
              <div id="thermal-receipt" className="p-6 font-mono text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 space-y-3">
                <div className="text-center space-y-1">
                  <h4 className="font-extrabold text-sm uppercase tracking-wide">
                    {completedSale.organization?.name || 'ADDIS SUPERMARKET'}
                  </h4>
                  <p className="text-[11px] text-slate-500">{completedSale.organization?.address || 'Bole Road, Mega Building'}</p>
                  <p className="text-[11px] text-slate-500">TIN: {completedSale.organization?.tinNumber || '0012345678'}</p>
                </div>

                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 text-[11px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Receipt #:</span>
                    <span className="font-bold">{completedSale.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span>{new Date(completedSale.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Method:</span>
                    <span>{completedSale.payment?.method}</span>
                  </div>
                </div>

                {/* Items List */}
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1.5">
                  {completedSale.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate pr-2">
                        {item.productName || 'Product'} × {item.quantity}
                      </span>
                      <span className="font-bold">{formatETB(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>

                {/* Receipt Totals */}
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-2 space-y-1 font-bold">
                  <div className="flex justify-between">
                    <span>TOTAL:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatETB(completedSale.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-normal text-[10px] text-slate-500">
                    <span>VAT (15% Included):</span>
                    <span>{formatETB(completedSale.taxAmount)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 pt-3 text-center text-[10px] text-slate-500">
                  <p>{completedSale.organization?.receiptFooter || 'Thank you for shopping with us!'}</p>
                  <p className="mt-1">Powered by DukaFlow</p>
                </div>
              </div>

              {/* Receipt Modal Buttons */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Receipt
                </button>
                <button
                  onClick={() => setCompletedSale(null)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                >
                  New Sale
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
