import React, { useState, useEffect, useRef } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { apiService } from '../../services/api';
import { PaymentMethod, Order, ScheduledSlot, Address } from '../../types';
import {
  MapPin,
  CreditCard,
  Banknote,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Clock,
  Bike,
  ShoppingBag,
  Sparkles,
  Info,
  Plus,
  Minus,
  Trash2,
  Check,
  X,
  Store,
  Crosshair,
  Navigation,
  MessageSquare,
  ChevronRight,
  Utensils,
  AlertCircle
} from 'lucide-react';
import { PaymentSuccessCheckmark } from '../../components/PaymentSuccessCheckmark';

interface CheckoutViewProps {
  onBackToCart: () => void;
  onOrderSuccess: (order: Order) => void;
  onCheckoutFlowChange: (isFlow: boolean) => void;
  onAddressSelectionChange: (isAddress: boolean) => void;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({ 
  onBackToCart, 
  onOrderSuccess, 
  onCheckoutFlowChange,
  onAddressSelectionChange
}) => {
  const {
    cartItems,
    selectedAddress,
    savedAddresses,
    setSelectedAddress,
    saveNewAddress,
    orderNotes,
    setOrderNotes,
    subtotal,
    deliveryFee,
    tax,
    clearCart,
    updateQuantity,
    removeFromCart,
    setIsAddressModalOpen
  } = useCart();
  const { currentUser, settings } = useAuth();

  useEffect(() => {
    onCheckoutFlowChange(true);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    return () => onCheckoutFlowChange(false);
  }, [onCheckoutFlowChange]);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('ONLINE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showTaxInfo, setShowTaxInfo] = useState(false);

  // Address modal states
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [isLocatingCheckout, setIsLocatingCheckout] = useState(false);
  const [newAddrForm, setNewAddrForm] = useState<Partial<Address>>({
    name: currentUser?.name || 'Customer',
    phone: currentUser?.phone || '+91 98765 43210',
    doorNo: '',
    street: '',
    area: '',
    city: 'Coimbatore',
    pincode: '641018',
    type: 'HOME'
  });

  const handleCheckoutStartAddViaLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setNewAddrForm({
        name: currentUser?.name || 'Customer',
        phone: currentUser?.phone || '+91 98765 43210',
        doorNo: '',
        street: 'Greenways Road, Sector 3',
        area: 'Race Course',
        city: 'Coimbatore',
        pincode: '641018',
        type: 'HOME',
        coordinates: '11.0045, 76.9612'
      });
      setShowAddAddressForm(true);
      return;
    }
    setIsLocatingCheckout(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const coordsStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
              headers: {
                'Accept-Language': 'en',
                'User-Agent': 'HuntersKitchenApp/1.0'
              }
            }
          );
          if (!response.ok) throw new Error('Geocoding error');
          const data = await response.json();
          if (data && data.address) {
            const addr = data.address;
            setNewAddrForm({
              name: currentUser?.name || 'Customer',
              phone: currentUser?.phone || '+91 98765 43210',
              doorNo: addr.house_number || addr.building || '',
              street: addr.road || addr.pedestrian || addr.cycleway || addr.footway || addr.path || addr.suburb || addr.neighbourhood || 'Main Road',
              area: addr.suburb || addr.neighbourhood || addr.city_district || addr.residential || addr.village || addr.quarter || 'Central District',
              city: addr.city || addr.town || addr.village || 'Coimbatore',
              pincode: addr.postcode || '641018',
              type: 'HOME',
              coordinates: coordsStr
            });
          } else {
            setNewAddrForm({
              name: currentUser?.name || 'Customer',
              phone: currentUser?.phone || '+91 98765 43210',
              doorNo: '',
              street: 'Avinashi Road, Peelamedu',
              area: 'Peelamedu',
              city: 'Coimbatore',
              pincode: '641018',
              type: 'HOME',
              coordinates: coordsStr
            });
          }
        } catch (err) {
          console.warn('Geocoding failed, falling back:', err);
          setNewAddrForm({
            name: currentUser?.name || 'Customer',
            phone: currentUser?.phone || '+91 98765 43210',
            doorNo: '',
            street: 'Avinashi Road, Peelamedu',
            area: 'Peelamedu',
            city: 'Coimbatore',
            pincode: '641018',
            type: 'HOME',
            coordinates: coordsStr
          });
        } finally {
          setIsLocatingCheckout(false);
          setShowAddAddressForm(true);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setNewAddrForm({
          name: currentUser?.name || 'Customer',
          phone: currentUser?.phone || '+91 98765 43210',
          doorNo: '',
          street: 'Greenways Road, Sector 3',
          area: 'Race Course',
          city: 'Coimbatore',
          pincode: '641018',
          type: 'HOME',
          coordinates: '11.0045, 76.9612'
        });
        setIsLocatingCheckout(false);
        setShowAddAddressForm(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Order confirmed tick animation modal
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  
  useEffect(() => {
    onAddressSelectionChange(showAddressModal);
    setIsAddressModalOpen(showAddressModal);
  }, [showAddressModal, onAddressSelectionChange, setIsAddressModalOpen]);

  // Active delivery address
  const activeAddress = selectedAddress || savedAddresses[0] || null;

  // Adjust Delivery Fee for Pickup vs Delivery
  const effectiveDeliveryFee = fulfillmentType === 'PICKUP' ? 0 : deliveryFee;
  const effectiveGrandTotal = subtotal + effectiveDeliveryFee + tax;
  const totalItemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const cgst = (subtotal * 0.025).toFixed(2);
  const sgst = (subtotal * 0.025).toFixed(2);

  // COD Cash Note & Change state
  const [codCashNoteOption, setCodCashNoteOption] = useState<'EXACT' | '500' | '1000' | '2000' | 'CUSTOM'>('500');
  const [customCashAmount, setCustomCashAmount] = useState<string>('');
  const [isCashNoteShaking, setIsCashNoteShaking] = useState(false);
  const cashNoteRef = useRef<HTMLDivElement>(null);

  // Active Cash Tendered calculation
  const activeCashTendered = (() => {
    if (codCashNoteOption === 'EXACT') return effectiveGrandTotal;
    if (codCashNoteOption === '500') return Math.max(500, effectiveGrandTotal);
    if (codCashNoteOption === '1000') return Math.max(1000, effectiveGrandTotal);
    if (codCashNoteOption === '2000') return Math.max(2000, effectiveGrandTotal);
    if (codCashNoteOption === 'CUSTOM') return Math.max(Number(customCashAmount) || 0, 0);
    return effectiveGrandTotal;
  })();

  const codChangeDue = Math.max(0, activeCashTendered - effectiveGrandTotal);

  const handlePlaceOrder = async () => {
    if (fulfillmentType === 'DELIVERY' && !activeAddress) {
      setErrorMessage('Please add a delivery address to place your order.');
      setShowAddressModal(true);
      return;
    }

    if (paymentMethod === 'COD' && activeCashTendered < effectiveGrandTotal) {
      setErrorMessage(`Cash note (₹${activeCashTendered}) is less than total bill ₹${effectiveGrandTotal}. Please adjust the cash amount.`);
      setIsCashNoteShaking(true);
      if (cashNoteRef.current) {
        cashNoteRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        setIsCashNoteShaking(false);
      }, 700);
      return;
    }

    await executeOrderCreation(paymentMethod);
  };

  const executeOrderCreation = async (method: PaymentMethod) => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // Revalidate cart with backend before submission
      if (cartItems.length > 0) {
        const val: any = await apiService.validateCart(cartItems);
        if (val && val.valid === false) {
          setErrorMessage(val.message || 'Cart validation failed. Please check your items.');
          setIsSubmitting(false);
          return;
        }
      }

      const scheduledSlotObj: ScheduledSlot = {
        type: 'NOW',
        fulfillmentType,
        formattedText: `Express ${fulfillmentType === 'DELIVERY' ? 'Delivery (25-35 mins)' : 'Self Pickup (15 mins)'}`
      };

      const orderPayload = {
        customerId: currentUser?.id || 'usr_customer_1',
        customerName: currentUser?.name || activeAddress?.name || 'Customer',
        customerPhone: currentUser?.phone || activeAddress?.phone || '+91 98765 43210',
        deliveryAddress: activeAddress || {
          id: 'addr_pickup',
          name: currentUser?.name || 'Customer',
          phone: currentUser?.phone || '+91 98765 43210',
          doorNo: '',
          street: settings?.address || 'Hunter\'s Kitchen Counter',
          area: '',
          city: 'Coimbatore',
          pincode: '641018',
          type: 'HOME' as const
        },
        items: cartItems,
        orderNotes,
        paymentMethod: method,
        codCashTendered: method === 'COD' ? activeCashTendered : undefined,
        codChangeDue: method === 'COD' ? codChangeDue : undefined,
        scheduledSlot: scheduledSlotObj
      };

      const createdOrder = await apiService.createOrder(orderPayload);

      // Handle Online Payment Flow via Razorpay
      if (method === 'ONLINE') {
        const loadRazorpayScript = (): Promise<boolean> => {
          return new Promise((resolve) => {
            if ((window as any).Razorpay) {
              resolve(true);
              return;
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
          });
        };

        const isLoaded = await loadRazorpayScript();
        if (!isLoaded || !(window as any).Razorpay) {
          throw new Error('Could not load payment gateway. Please check your internet connection or use Cash on Delivery.');
        }

        const gatewayData = await apiService.createGatewayOrder(createdOrder.id);

        const rzp = new (window as any).Razorpay({
          key: gatewayData.keyId,
          amount: gatewayData.amountPaise,
          currency: gatewayData.currency || 'INR',
          name: "Hunter's Kitchen",
          description: `Order #${createdOrder.orderNumber}`,
          order_id: gatewayData.gatewayOrderId,
          prefill: {
            name: currentUser?.name || 'Customer',
            email: currentUser?.email || '',
            contact: currentUser?.phone || ''
          },
          theme: {
            color: '#b91c1c'
          },
          handler: async (response: any) => {
            try {
              setIsSubmitting(true);
              await apiService.verifyPayment({
                orderId: createdOrder.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              });

              setConfirmedOrder({
                ...createdOrder,
                paymentStatus: 'VERIFIED',
                status: 'ACCEPTED'
              });
            } catch (vErr: any) {
              console.error('Payment verification error:', vErr);
              setErrorMessage(vErr.message || 'Payment verification failed. Please contact support.');
            } finally {
              setIsSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              setIsSubmitting(false);
              setErrorMessage(`Payment window closed. Order #${createdOrder.orderNumber} is pending payment.`);
            }
          }
        });

        rzp.on('payment.failed', (resp: any) => {
          setIsSubmitting(false);
          const reason = resp.error?.description || resp.error?.reason || 'Payment failed';
          setErrorMessage(`Payment failed: ${reason}. Please try another payment method.`);
        });

        rzp.open();
        return;
      }

      // Cash on Delivery Flow: Instant Confirmation
      setConfirmedOrder(createdOrder);
    } catch (err: any) {
      console.error('Order creation error:', err);
      setErrorMessage(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto transition to tracking view after tick animation modal appears
  useEffect(() => {
    if (confirmedOrder) {
      const timer = setTimeout(() => {
        clearCart();
        onOrderSuccess(confirmedOrder);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmedOrder]);

  const handleAddNewAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddrForm.doorNo || !newAddrForm.street || !newAddrForm.area) {
      alert('Please fill door no, street, and area');
      return;
    }
    const saved = await saveNewAddress(newAddrForm);
    setSelectedAddress(saved);
    setShowAddAddressForm(false);
    setShowAddressModal(false);
  };

  if (cartItems.length === 0 && !confirmedOrder) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
        <div className="w-20 h-20 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-black text-stone-900">Your Cart is Empty</h3>
        <p className="text-sm text-stone-500 leading-relaxed">
          Please select your favorite dishes from Hunter's Kitchen menu before proceeding to checkout.
        </p>
        <button
          onClick={onBackToCart}
          className="px-6 py-3 rounded-2xl bg-red-700 hover:bg-red-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
        >
          Return to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32 md:pb-20 w-full max-w-5xl mx-auto px-0 py-3 sm:py-5 space-y-3.5 sm:space-y-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBackToCart}
            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 active:scale-95 flex items-center justify-center text-stone-700 transition-all cursor-pointer shadow-2xs shrink-0"
            title="Back to Menu"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight leading-tight truncate">
              Cart
            </h1>
            <p className="text-xs text-stone-500 font-medium truncate">
              Hunter's Kitchen • <span className="text-emerald-700 font-bold">25-35 mins</span>
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-2xs shrink-0 whitespace-nowrap">
          <Utensils className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">{totalItemCount} {totalItemCount === 1 ? 'Item' : 'Items'}</span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs sm:text-sm font-semibold flex items-center gap-3 shadow-xs animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Items, Fulfillment, Address, Instructions) */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. ORDER ITEMS CARD (Swiggy Style) */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900">
                  Order Items ({cartItems.length})
                </h2>
              </div>
            </div>

            {/* Detailed Item Rows */}
            <div className="divide-y divide-stone-100">
              {cartItems.map((item) => (
                <div key={item.cartItemId} className="py-3.5 flex items-center justify-between gap-3">
                  {/* Left: Veg/Non-Veg Badge & Dish Info */}
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      <div
                        className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center ${
                          item.menuItem?.isVeg ? 'border-emerald-600 bg-white' : 'border-red-600 bg-white'
                        }`}
                        title={item.menuItem?.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.menuItem?.isVeg ? 'bg-emerald-600' : 'bg-red-600'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-bold text-stone-900 leading-snug break-words">
                        {item.menuItem?.name || 'Dish'}
                      </h3>
                      
                      {/* Customizations & Addons */}
                      {((item.customizations && item.customizations.length > 0) || (item.addons && item.addons.length > 0)) && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(item.customizations || []).map((c, i) => (
                            <span
                              key={`cust-${i}`}
                              className="text-[10px] sm:text-xs text-stone-500 font-medium bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200/60"
                            >
                              {c.optionName}: <strong>{c.selectedLabel}</strong>
                            </span>
                          ))}
                          {(item.addons || []).map((a, i) => (
                            <span
                              key={`addon-${i}`}
                              className="text-[10px] sm:text-xs text-amber-800 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60"
                            >
                              +{a.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Special Cooking Note */}
                      {item.specialInstructions && (
                        <p className="text-[11px] text-stone-500 italic mt-0.5 flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                          <span>"{item.specialInstructions}"</span>
                        </p>
                      )}

                      <p className="text-[11px] sm:text-xs text-stone-400 font-semibold mt-0.5">
                        ₹{item.itemTotalPrice / item.quantity} per unit
                      </p>
                    </div>
                  </div>

                  {/* Right: Quantity Stepper & Total Price */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-xs font-bold text-stone-800 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                        className="w-5 h-5 flex items-center justify-center hover:bg-stone-200 rounded text-stone-700 hover:text-red-700 transition-colors cursor-pointer"
                        title={item.quantity === 1 ? 'Remove' : 'Decrease'}
                      >
                        {item.quantity === 1 ? <Trash2 className="w-3 h-3 text-red-600" /> : <Minus className="w-3 h-3" />}
                      </button>
                      <span className="w-5 text-center font-black text-stone-900 text-xs sm:text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                        className="w-5 h-5 flex items-center justify-center hover:bg-stone-200 rounded text-stone-700 hover:text-red-700 transition-colors cursor-pointer"
                        title="Increase"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="w-14 sm:w-16 text-right font-black text-stone-900 text-xs sm:text-sm">
                      ₹{item.itemTotalPrice}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add More Dishes Action Row */}
            <button
              onClick={onBackToCart}
              type="button"
              className="w-full py-2.5 px-4 rounded-xl border border-dashed border-stone-300 hover:border-red-400 bg-stone-50/60 hover:bg-red-50/50 text-red-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More Dishes</span>
            </button>
          </div>

          {/* 2. ORDER FULFILLMENT MODE */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900 truncate">
                  Fulfillment Mode
                </h2>
              </div>
              <span className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Express ({fulfillmentType === 'DELIVERY' ? '25-35 mins' : '15 mins'})</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-stone-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFulfillmentType('DELIVERY')}
                className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  fulfillmentType === 'DELIVERY'
                    ? 'bg-white text-red-900 shadow-xs ring-1 ring-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Bike className="w-4 h-4 text-red-600" />
                <span>Home Delivery</span>
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType('PICKUP')}
                className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  fulfillmentType === 'PICKUP'
                    ? 'bg-white text-amber-900 shadow-xs ring-1 ring-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                <span>Self Pickup</span>
              </button>
            </div>
          </div>

          {/* 3. DELIVERY ADDRESS OR PICKUP LOCATION */}
          {fulfillmentType === 'DELIVERY' ? (
            <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900 truncate">
                    Delivery Address
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddressModal(true)}
                  className="shrink-0 text-xs font-black text-red-700 hover:text-red-800 uppercase tracking-wider cursor-pointer"
                >
                  {activeAddress ? 'Change' : '+ Add'}
                </button>
              </div>

              {activeAddress ? (
                <div className="p-3 bg-stone-50/70 rounded-xl border border-stone-200/70 space-y-1 text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">
                      {activeAddress.name || currentUser?.name || 'Customer'}
                    </span>
                    <span className="text-[10px] font-bold uppercase bg-white text-stone-700 px-1.5 py-0.5 rounded border border-stone-200">
                      {activeAddress.type || 'HOME'}
                    </span>
                  </div>
                  <p className="text-stone-600 leading-relaxed font-medium">
                    {activeAddress.doorNo ? `${activeAddress.doorNo}, ` : ''}{activeAddress.street || ''}, {activeAddress.area || ''}, {activeAddress.city || ''} -{' '}
                    <span className="font-bold text-stone-800">{activeAddress.pincode || ''}</span>
                  </p>
                  {activeAddress.phone && (
                    <p className="text-stone-500 font-semibold text-xs">📞 {activeAddress.phone}</p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-stone-50 border border-dashed border-stone-300 rounded-xl text-center space-y-2">
                  <p className="text-xs font-bold text-stone-700">No delivery address selected</p>
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-bold shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Select Address</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-1">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs sm:text-sm">
                <Store className="w-4 h-4 text-amber-700" />
                <span>Self Pickup Counter</span>
              </div>
              <p className="text-xs text-stone-700 font-medium">
                {settings?.restaurantName || "Hunter's Kitchen"} • {settings?.address || "Chinnavedapatti, Saravanampatti, Coimbatore"}
              </p>
              <p className="text-[11px] text-amber-800 font-semibold pt-0.5">
                ⚡ Ready for collection in ~15 minutes.
              </p>
            </div>
          )}

          {/* 4. COOKING & DELIVERY INSTRUCTIONS */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900">
                Cooking / Delivery Instructions
              </h2>
            </div>
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="e.g. Please send extra spicy salna, do not ring bell / leave at door..."
              rows={2}
              className="w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-xs sm:text-sm text-stone-800 placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-red-600 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Right Column: Sticky Payment & Bill Breakdown */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          {/* 5. SELECT PAYMENT METHOD */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold shrink-0">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900 truncate">
                  Payment Method
                </h2>
              </div>
              <span className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" /> 100% Secure
              </span>
            </div>

            <div className="space-y-2">
              {/* Online Payment */}
              <label
                onClick={() => setPaymentMethod('ONLINE')}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'ONLINE'
                    ? 'border-red-500 bg-red-50/60 ring-1 ring-red-500/30 shadow-2xs'
                    : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 font-bold">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-stone-900">Online Payment</p>
                    <p className="text-[11px] text-stone-500">UPI, Cards, NetBanking</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'ONLINE'}
                  onChange={() => setPaymentMethod('ONLINE')}
                  className="w-4 h-4 text-red-600 focus:ring-red-600 cursor-pointer accent-red-600"
                />
              </label>

              {/* COD */}
              <label
                onClick={() => setPaymentMethod('COD')}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'COD'
                    ? 'border-red-500 bg-red-50/60 ring-1 ring-red-500/30 shadow-2xs'
                    : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold">
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-stone-900">Cash on Delivery (COD)</p>
                    <p className="text-[11px] text-stone-500">Pay cash upon arrival</p>
                  </div>
                </div>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  className="w-4 h-4 text-red-600 focus:ring-red-600 cursor-pointer accent-red-600"
                />
              </label>

              {/* COD Calculator */}
              {paymentMethod === 'COD' && (
                <div
                  ref={cashNoteRef}
                  className={`mt-3 p-3.5 rounded-xl space-y-2.5 transition-all duration-200 ${
                    isCashNoteShaking
                      ? 'animate-shake ring-2 ring-red-500 border border-red-500 bg-red-50/90'
                      : activeCashTendered < effectiveGrandTotal
                      ? 'bg-amber-50/80 border border-amber-300 ring-1 ring-amber-400/50'
                      : 'bg-amber-50/60 border border-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-amber-800" />
                    <span className="font-bold text-xs sm:text-sm text-stone-900">Cash Note You Will Provide</span>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {Array.from(new Set([Math.ceil(effectiveGrandTotal / 100) * 100, Math.ceil(effectiveGrandTotal / 500) * 500])).filter(amount => amount > effectiveGrandTotal).map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setCodCashNoteOption('CUSTOM');
                          setCustomCashAmount(amount.toString());
                        }}
                        className={`px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer text-xs ${
                          codCashNoteOption === 'CUSTOM' && customCashAmount === amount.toString()
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-stone-800 border-stone-200 hover:border-amber-400'
                        }`}
                      >
                        ₹{amount}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => setCodCashNoteOption('EXACT')}
                      className={`px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer text-xs ${
                        codCashNoteOption === 'EXACT'
                          ? 'bg-amber-700 text-white border-amber-700'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-amber-400'
                      }`}
                    >
                      Exact (₹{Number(effectiveGrandTotal).toFixed(2).replace(/\.00$/, '')})
                    </button>

                    {effectiveGrandTotal <= 500 && (
                      <button
                        type="button"
                        onClick={() => setCodCashNoteOption('500')}
                        className={`px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer text-xs ${
                          codCashNoteOption === '500'
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-stone-800 border-stone-200 hover:border-amber-400'
                        }`}
                      >
                        ₹500 Note
                      </button>
                    )}
                  </div>

                  {/* Calculation Card */}
                  <div className="p-2.5 bg-white rounded-lg border border-amber-200 space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Order Total Bill:</span>
                      <span className="font-bold text-stone-900">₹{Number(effectiveGrandTotal).toFixed(2).replace(/\.00$/, '')}</span>
                    </div>
                    <div className="pt-1 border-t border-dashed border-stone-200 flex justify-between font-bold">
                      <span className="text-stone-800">Cash Provided:</span>
                      <span className="text-amber-900 font-extrabold">₹{activeCashTendered}</span>
                    </div>
                    <div className="pt-1 border-t border-dashed border-stone-200 flex justify-between font-extrabold text-xs sm:text-sm">
                      <span className="text-stone-800">Remaining Change Due:</span>
                      <span className={codChangeDue > 0 ? 'text-emerald-700 font-black' : 'text-stone-600 font-bold'}>
                        {codChangeDue > 0 ? `₹${Number(codChangeDue).toFixed(2).replace(/\.00$/, '')}` : '₹0'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 6. BILL DETAILS CARD (Swiggy Invoice Style) */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-3">
            <h3 className="font-extrabold text-xs sm:text-sm text-stone-900 uppercase tracking-wide pb-2 border-b border-stone-100">
              Bill Details
            </h3>

            <div className="space-y-2 text-xs sm:text-sm text-stone-600">
              <div className="flex justify-between items-center">
                <span>Item Total ({cartItems.length} {cartItems.length === 1 ? 'dish' : 'dishes'})</span>
                <span className="font-bold text-stone-900">₹{subtotal}</span>
              </div>

              <div className="flex justify-between items-center">
                <span>Delivery Partner Fee</span>
                <span>
                  {effectiveDeliveryFee === 0 ? (
                    <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                      FREE
                    </span>
                  ) : (
                    <span className="font-bold text-stone-900">₹{effectiveDeliveryFee}</span>
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <span>Taxes and Charges (5% GST)</span>
                  <button
                    type="button"
                    onClick={() => setShowTaxInfo(true)}
                    className="text-stone-400 hover:text-red-600 p-0.5 cursor-pointer inline-flex items-center"
                    title="Click for tax breakdown"
                  >
                    <Info className="w-3.5 h-3.5 text-stone-400 hover:text-red-600" />
                  </button>
                </span>
                <span className="font-bold text-stone-900">₹{Number(tax).toFixed(2).replace(/\.00$/, '')}</span>
              </div>

              {/* Tax Modal */}
              {showTaxInfo && (
                <div className="fixed inset-0 bg-stone-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
                  <div className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl border border-stone-100 scale-100 animate-in zoom-in-95 duration-200 relative">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-black text-stone-900 text-sm">Tax Breakdown</h3>
                          <p className="text-[11px] text-stone-400 font-medium">Govt. Mandated 5% GST Split</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowTaxInfo(false)}
                        className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-stone-900">Central GST (CGST)</p>
                          <p className="text-[10px] text-stone-500">2.5% on food subtotal</p>
                        </div>
                        <span className="font-black text-stone-900 text-sm">₹{cgst}</span>
                      </div>

                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-stone-900">State GST (SGST)</p>
                          <p className="text-[10px] text-stone-500">2.5% on food subtotal</p>
                        </div>
                        <span className="font-black text-stone-900 text-sm">₹{sgst}</span>
                      </div>

                      <div className="p-3 bg-red-50/90 rounded-xl border border-red-200 flex items-center justify-between text-red-900">
                        <div>
                          <p className="font-black text-xs">Total Taxes (5%)</p>
                          <p className="text-[10px] text-red-700">Calculated on ₹{subtotal}</p>
                        </div>
                        <span className="font-black text-sm text-red-700">₹{Number(tax).toFixed(2).replace(/\.00$/, '')}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowTaxInfo(false)}
                      className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
                    >
                      Got It
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-stone-200 flex justify-between items-baseline font-black text-sm sm:text-base text-stone-900">
                <span className="uppercase tracking-wide font-black">To Pay</span>
                <span className="text-lg sm:text-xl font-black text-stone-900">₹{Number(effectiveGrandTotal).toFixed(2).replace(/\.00$/, '')}</span>
              </div>
            </div>

            {/* Place Order Primary Action Button */}
            <div className="pt-2">
              <button
                disabled={isSubmitting}
                onClick={handlePlaceOrder}
                className="w-full py-3.5 px-4 rounded-xl bg-red-700 hover:bg-red-800 active:scale-[0.99] text-white font-black text-sm sm:text-base shadow-lg shadow-red-700/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer uppercase tracking-wider"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-white" />
                    <span>Place Order • ₹{Number(effectiveGrandTotal).toFixed(2).replace(/\.00$/, '')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ADDRESS SELECTOR / ADD MODAL */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 pb-28 sm:pb-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-red-600" />
                <h3 className="font-black text-stone-900 text-base sm:text-lg">Select Delivery Address</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddressModal(false);
                  setShowAddAddressForm(false);
                }}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!showAddAddressForm ? (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  {savedAddresses.map((addr) => {
                    const isSelected = activeAddress.id === addr.id;
                    return (
                      <div
                        key={addr.id}
                        onClick={() => {
                          setSelectedAddress(addr);
                          setShowAddressModal(false);
                        }}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between ${
                          isSelected
                            ? 'border-red-600 bg-red-50/60 ring-2 ring-red-600/20 shadow-xs'
                            : 'border-stone-200 hover:border-stone-300 bg-stone-50/30'
                        }`}
                      >
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-extrabold text-stone-900">
                              {addr?.name || 'Address'}
                            </p>
                            <span className="text-xs font-bold uppercase bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md border border-stone-200">
                              {addr?.type || 'HOME'}
                            </span>
                          </div>
                          <p className="text-stone-600 font-medium text-xs sm:text-sm leading-relaxed">
                            {addr?.doorNo ? `${addr.doorNo}, ` : ''}{addr?.street || ''}, {addr?.area || ''}, {addr?.city || ''} - {addr?.pincode || ''}
                          </p>
                          <p className="text-stone-500 text-xs font-semibold">Phone: {addr?.phone || ''}</p>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-red-600 shrink-0 mt-1" />}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCheckoutStartAddViaLocation}
                    disabled={isLocatingCheckout}
                    className="py-3 px-3 rounded-2xl border border-dashed border-red-300 bg-red-50/70 text-red-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-red-100/70 transition-all active:scale-95 disabled:opacity-55 cursor-pointer"
                  >
                    {isLocatingCheckout ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-600 shrink-0" />
                    ) : (
                      <Crosshair className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{isLocatingCheckout ? 'Locating...' : 'Use My Location'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewAddrForm({
                        name: currentUser?.name || 'Customer',
                        phone: currentUser?.phone || '+91 98765 43210',
                        doorNo: '',
                        street: '',
                        area: '',
                        city: 'Coimbatore',
                        pincode: '641018',
                        type: 'HOME',
                        coordinates: ''
                      });
                      setShowAddAddressForm(true);
                    }}
                    className="py-3 px-3 rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-stone-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-stone-100 transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 shrink-0 text-stone-500" />
                    <span>Enter Manually</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddNewAddressSubmit} className="space-y-3.5 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Address Type</label>
                    <select
                      value={newAddrForm.type || 'HOME'}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, type: e.target.value as any })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none bg-white text-sm font-medium"
                    >
                      <option value="HOME">Home</option>
                      <option value="WORK">Work</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newAddrForm.name || ''}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, name: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                      placeholder="e.g. Priya Sundaram"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1 text-xs">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={newAddrForm.phone || ''}
                    onChange={(e) => setNewAddrForm({ ...newAddrForm, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                    placeholder="+91 99887 76655"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Flat / Door No</label>
                    <input
                      type="text"
                      required
                      value={newAddrForm.doorNo || ''}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, doorNo: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                      placeholder="e.g. #42, Flat 3B"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Street / Road</label>
                    <input
                      type="text"
                      required
                      value={newAddrForm.street || ''}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, street: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                      placeholder="e.g. Richmond Road"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Area / Landmark</label>
                    <input
                      type="text"
                      required
                      value={newAddrForm.area || ''}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, area: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                      placeholder="e.g. Shanthi Nagar"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-stone-700 block mb-1 text-xs">Pincode</label>
                    <input
                      type="text"
                      required
                      value={newAddrForm.pincode || ''}
                      onChange={(e) => setNewAddrForm({ ...newAddrForm, pincode: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-stone-300 focus:ring-2 focus:ring-red-600 outline-none text-sm font-medium"
                      placeholder="641018"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-stone-700 flex items-center gap-1 text-xs">
                      <Navigation className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>GPS Coordinates</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          alert('Geolocation is not supported by your browser');
                          return;
                        }
                        setIsLocatingCheckout(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            const lat = position.coords.latitude.toFixed(6);
                            const lng = position.coords.longitude.toFixed(6);
                            setNewAddrForm(prev => ({ ...prev, coordinates: `${lat}, ${lng}` }));
                            setIsLocatingCheckout(false);
                          },
                          (error) => {
                            console.warn(error);
                            setNewAddrForm(prev => ({ ...prev, coordinates: '11.0045, 76.9612' }));
                            setIsLocatingCheckout(false);
                          },
                          { enableHighAccuracy: true, timeout: 5000 }
                        );
                      }}
                      disabled={isLocatingCheckout}
                      className="text-xs font-bold text-red-700 hover:text-red-800 flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200/60 px-2.5 py-1 rounded-lg transition-all"
                    >
                      {isLocatingCheckout ? (
                        <Loader2 className="w-3 h-3 animate-spin text-red-600" />
                      ) : (
                        <Crosshair className="w-3 h-3 text-red-600" />
                      )}
                      <span>{isLocatingCheckout ? 'Locating...' : 'Get GPS'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 11.0168, 76.9558"
                    value={newAddrForm.coordinates || ''}
                    onChange={(e) => setNewAddrForm({ ...newAddrForm, coordinates: e.target.value })}
                    className="w-full p-2.5 border border-stone-300 rounded-xl text-xs font-mono focus:border-red-600 outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddAddressForm(false)}
                    className="flex-1 py-3 rounded-2xl border border-stone-300 text-stone-700 font-bold hover:bg-stone-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-2xl bg-red-700 hover:bg-red-800 text-white font-bold shadow-md transition-colors cursor-pointer"
                  >
                    Save Address
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ORDER CONFIRMED TICK ANIMATION OVERLAY */}
      {confirmedOrder && (
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-white animate-in fade-in duration-300">
          <style>{`
            @keyframes swiggy-fade-up {
              0% { opacity: 0; transform: translateY(12px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .swiggy-anim-fade {
              animation: swiggy-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
            }
          `}</style>

          <div className="flex flex-col items-center justify-center text-center p-6 max-w-sm w-full">
            {/* Professional GPay-Style Animated Success Checkmark (Outer Ring, Mint Light Green, Clean SVG Stroke Draw) */}
            <PaymentSuccessCheckmark size={120} variant="gpay" className="mb-8" />


            {/* "Order Placed" Bold Success Title */}
            <h2 
              className="text-3xl font-black text-stone-900 tracking-tight swiggy-anim-fade uppercase"
              style={{ animationDelay: '1s' }}
            >
              Order Placed!
            </h2>

            {/* Delighted reassurance message */}
            <p 
              className="text-sm text-stone-500 mt-1 font-medium swiggy-anim-fade"
              style={{ animationDelay: '1.1s' }}
            >
              Hunter's Kitchen has received your order & is preparing your meal!
            </p>

            {/* Divider line */}
            <div 
              className="w-12 h-0.5 bg-stone-200 my-4 rounded-full swiggy-anim-fade"
              style={{ animationDelay: '1.2s' }}
            />

            {/* Deliver-To/Pickup Location block */}
            <div 
              className="text-sm text-stone-600 leading-relaxed swiggy-anim-fade bg-stone-50 p-4 rounded-2xl border border-stone-200/80 w-full"
              style={{ animationDelay: '1.3s' }}
            >
              <span className="text-xs uppercase font-black tracking-widest text-emerald-600 block mb-1">
                {fulfillmentType === 'PICKUP' ? 'PICKUP HUB' : 'DELIVERING TO'}
              </span>
              
              {fulfillmentType === 'PICKUP' ? (
                <div className="font-bold text-stone-800">
                  <p className="text-sm font-extrabold">{settings?.restaurantName || "Hunter's Kitchen"}</p>
                  <p className="text-stone-500 font-medium text-xs mt-0.5">
                    {settings?.address || "42 Richmond Road, Shanthi Nagar, Bengaluru"}
                  </p>
                </div>
              ) : (
                <div className="font-bold text-stone-800">
                  <p className="text-sm font-extrabold">{activeAddress?.name || 'Customer'} ({activeAddress?.type || 'Home'})</p>
                  <p className="text-stone-500 font-medium text-xs mt-0.5 leading-normal">
                    {activeAddress?.doorNo ? `${activeAddress.doorNo}, ` : ''}{activeAddress?.street || ''}, {activeAddress?.area || ''}, {activeAddress?.city || ''} - {activeAddress?.pincode || ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
