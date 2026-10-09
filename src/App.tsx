import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useCart } from './context/CartContext';
import { MenuItem, Order } from './types';

// Components & Auth
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { FloatingCartBar } from './components/FloatingCartBar';
import { FloatingLiveOrderBar } from './components/FloatingLiveOrderBar';
import { apiService } from './services/api';
import { LoginPage } from './components/auth/LoginPage';
import { LoginSuccessAnimation } from './components/auth/LoginSuccessAnimation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2, Flame } from 'lucide-react';

// Customer Views
import { CustomerHome } from './views/customer/CustomerHome';
import { CustomerSearch } from './views/customer/CustomerSearch';
import { FoodDetailModal } from './views/customer/FoodDetailModal';
import { CartView } from './views/customer/CartView';
import { CheckoutView } from './views/customer/CheckoutView';
import { OrderTrackingView } from './views/customer/OrderTrackingView';
import { CustomerOrderHistory } from './views/customer/CustomerOrderHistory';
import { CustomerProfile } from './views/customer/CustomerProfile';

// Owner Views (Lazy Loaded for optimal initial bundle & mobile load performance)
const OwnerDashboard = React.lazy(() => import('./views/owner/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
const OwnerOrdersView = React.lazy(() => import('./views/owner/OwnerOrdersView').then(m => ({ default: m.OwnerOrdersView })));
const OwnerMenuView = React.lazy(() => import('./views/owner/OwnerMenuView').then(m => ({ default: m.OwnerMenuView })));
const OwnerStaffView = React.lazy(() => import('./views/owner/OwnerStaffView').then(m => ({ default: m.OwnerStaffView })));
const OwnerAnalyticsView = React.lazy(() => import('./views/owner/OwnerAnalyticsView').then(m => ({ default: m.OwnerAnalyticsView })));
const OwnerSettingsView = React.lazy(() => import('./views/owner/OwnerSettingsView').then(m => ({ default: m.OwnerSettingsView })));
const OwnerProfileView = React.lazy(() => import('./views/owner/OwnerProfileView').then(m => ({ default: m.OwnerProfileView })));

// Staff & Delivery Views (Lazy Loaded)
const StaffDashboard = React.lazy(() => import('./views/staff/StaffDashboard').then(m => ({ default: m.StaffDashboard })));
const DeliveryDashboard = React.lazy(() => import('./views/delivery/DeliveryDashboard').then(m => ({ default: m.DeliveryDashboard })));
const DeliveryHistoryView = React.lazy(() => import('./views/delivery/DeliveryHistoryView').then(m => ({ default: m.DeliveryHistoryView })));
const DeliveryProfileView = React.lazy(() => import('./views/delivery/DeliveryProfileView').then(m => ({ default: m.DeliveryProfileView })));

const ViewSuspenseFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
    <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
    <span className="text-sm font-medium text-stone-500">Loading module...</span>
  </div>
);

export default function App() {
  const {
    currentUser,
    currentRole,
    isAuthenticated,
    isLoading,
    settings,
    loginSuccessUser,
    setLoginSuccessUser
  } = useAuth();
  const { addToCart, isAddressModalOpen } = useCart();

  // Navigation State
  const [currentTab, setCurrentTab] = useState('home');
  const [ownerInitialOrderFilter, setOwnerInitialOrderFilter] = useState<string>('ALL');

  const handleOwnerNavigateTab = (tab: string, filter?: string) => {
    if (filter) setOwnerInitialOrderFilter(filter);
    setCurrentTab(tab);
  };
  const [selectedFoodItem, setSelectedFoodItem] = useState<MenuItem | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hk_active_tracking_order_id');
    }
    return null;
  });
  const [isCheckoutFlow, setIsCheckoutFlow] = useState(false);
  const [isAddressSelection, setIsAddressSelection] = useState(false);

  const handleOpenTracking = (orderId: string) => {
    setTrackingOrderId(orderId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hk_active_tracking_order_id', orderId);
    }
  };

  const handleCloseTracking = (keepPersistent = true) => {
    setTrackingOrderId(null);
    if (!keepPersistent && typeof window !== 'undefined') {
      localStorage.removeItem('hk_active_tracking_order_id');
    }
  };

  // Route automatically upon authenticating or role switch, and restore active in-progress orders
  useEffect(() => {
    setSelectedFoodItem(null);
    if (!currentUser) return;

    if (currentUser.role === 'OWNER' || currentUser.role === 'ADMIN') {
      setTrackingOrderId(null);
      localStorage.removeItem('hk_active_tracking_order_id');
      setCurrentTab('owner_dashboard');
    } else if (currentUser.role === 'STAFF') {
      setTrackingOrderId(null);
      localStorage.removeItem('hk_active_tracking_order_id');
      setCurrentTab('staff_dashboard');
    } else if (currentUser.role === 'DELIVERY_PARTNER') {
      setTrackingOrderId(null);
      localStorage.removeItem('hk_active_tracking_order_id');
      setCurrentTab('delivery_dashboard');
    } else {
      // CUSTOMER ROLE:
      const savedTrackingId = typeof window !== 'undefined' ? localStorage.getItem('hk_active_tracking_order_id') : null;
      if (savedTrackingId) {
        apiService.getOrderById(savedTrackingId).then((order) => {
          if (order && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && order.status !== 'REJECTED') {
            setTrackingOrderId(order.id);
            setCurrentTab('orders');
          } else {
            localStorage.removeItem('hk_active_tracking_order_id');
            setTrackingOrderId(null);
          }
        }).catch(() => {
          setTrackingOrderId(savedTrackingId);
        });
      } else {
        // Check if customer has any active in-flight order
        apiService.getOrders({ role: 'CUSTOMER', userId: currentUser.id }).then((orders) => {
          if (Array.isArray(orders)) {
            const active = orders.find(
              (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.status !== 'REJECTED'
            );
            if (active) {
              setTrackingOrderId(active.id);
              localStorage.setItem('hk_active_tracking_order_id', active.id);
              setCurrentTab('orders');
            }
          }
        }).catch(() => {});
      }
    }
  }, [currentUser?.id, currentUser?.role]);

  // Scroll to top automatically whenever active tab or tracking changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [currentTab, trackingOrderId]);

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 text-stone-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 shadow-md shadow-red-500/20 mb-4 animate-pulse">
          <Flame className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-xl font-bold font-serif text-stone-900">Hunter's Kitchen</h2>
        <p className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
          <span>Verifying session security...</span>
        </p>
      </div>
    );
  }

  // Unauthenticated -> Show Production Login Page
  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  // Post-Login Success Transition (2.4s crisp professional transition)
  if (loginSuccessUser) {
    return (
      <LoginSuccessAnimation
        user={loginSuccessUser}
        onComplete={() => setLoginSuccessUser(null)}
        durationMs={2400}
      />
    );
  }

  const renderContent = () => {
    // ----------------------------------------------------------------------
    // CUSTOMER ROLE VIEWS
    // ----------------------------------------------------------------------
    if (currentRole === 'CUSTOMER') {
      if (trackingOrderId) {
        return (
          <OrderTrackingView
            orderId={trackingOrderId}
            onBack={() => handleCloseTracking(true)}
          />
        );
      }

      switch (currentTab) {
        case 'home':
          return (
            <CustomerHome
              currentTab={currentTab}
              onNavigateToCart={() => setCurrentTab('cart')}
              onNavigateToSearch={() => setCurrentTab('search')}
            />
          );
        case 'search':
          if (settings && !settings.isOpen) {
            return (
              <CustomerHome
                currentTab={currentTab}
                onNavigateToCart={() => setCurrentTab('cart')}
                onNavigateToSearch={() => setCurrentTab('search')}
              />
            );
          }
          return (
            <CustomerSearch
              onBack={() => setCurrentTab('home')}
              onNavigateToCart={() => setCurrentTab('cart')}
            />
          );
        case 'cart':
        case 'checkout':
          return (
            <CheckoutView
              onBackToCart={() => {
                setIsCheckoutFlow(false);
                setCurrentTab('home');
              }}
              onOrderSuccess={(order: Order) => {
                setIsCheckoutFlow(false);
                handleOpenTracking(order.id);
                setCurrentTab('orders');
              }}
              onCheckoutFlowChange={(isFlow: boolean) => setIsCheckoutFlow(isFlow)}
              onAddressSelectionChange={(isAddress: boolean) => setIsAddressSelection(isAddress)}
            />
          );
        case 'orders':
          return (
            <CustomerOrderHistory
              onSelectOrderToTrack={(orderId) => handleOpenTracking(orderId)}
              onNavigateToCart={() => setCurrentTab('cart')}
            />
          );
        case 'profile':
          return <CustomerProfile />;
        default:
          return (
            <CustomerHome
              currentTab={currentTab}
              onNavigateToCart={() => setCurrentTab('cart')}
              onNavigateToSearch={() => setCurrentTab('search')}
            />
          );
      }
    }

    // ----------------------------------------------------------------------
    // OWNER & ADMIN ROLE VIEWS
    // ----------------------------------------------------------------------
    if (currentRole === 'OWNER' || currentRole === 'ADMIN') {
      switch (currentTab) {
        case 'owner_dashboard':
          return (
            <OwnerDashboard
              onNavigateTab={handleOwnerNavigateTab}
              onSelectOrder={(orderId) => setCurrentTab('owner_orders')}
            />
          );
        case 'owner_orders':
          return <OwnerOrdersView initialStatusFilter={ownerInitialOrderFilter} />;
        case 'owner_menu':
          return <OwnerMenuView />;
        case 'owner_staff':
          return <OwnerStaffView />;
        case 'owner_analytics':
          return <OwnerAnalyticsView />;
        case 'owner_profile':
        case 'owner_settings':
          return <OwnerProfileView />;
        default:
          return (
            <OwnerDashboard
              onNavigateTab={handleOwnerNavigateTab}
              onSelectOrder={(orderId) => setCurrentTab('owner_orders')}
            />
          );
      }
    }

    // ----------------------------------------------------------------------
    // STAFF ROLE VIEWS
    // ----------------------------------------------------------------------
    if (currentRole === 'STAFF') {
      return (
        <StaffDashboard
          activeTab={currentTab}
          onNavigateTab={(tab) => setCurrentTab(tab)}
        />
      );
    }

    // ----------------------------------------------------------------------
    // DELIVERY PARTNER ROLE VIEWS
    // ----------------------------------------------------------------------
    if (currentRole === 'DELIVERY_PARTNER') {
      switch (currentTab) {
        case 'delivery_dashboard':
          return <DeliveryDashboard />;
        case 'delivery_history':
          return <DeliveryHistoryView />;
        case 'delivery_profile':
          return <DeliveryProfileView />;
        default:
          return <DeliveryDashboard />;
      }
    }

    return (
      <CustomerHome
        currentTab={currentTab}
        onNavigateToCart={() => setCurrentTab('cart')}
        onNavigateToSearch={() => setCurrentTab('search')}
      />
    );
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased selection:bg-red-700 selection:text-white">
      {/* Top Navbar */}
      {!(currentRole === 'CUSTOMER' && (isAddressSelection || trackingOrderId)) && (
        <Navbar 
          currentTab={currentTab}
          onTabChange={(tab) => {
            handleCloseTracking(true);
            setCurrentTab(tab);
          }}
          onCartClick={() => { 
            handleCloseTracking(true); 
            setCurrentTab('cart'); 
          }} 
        />
      )}

      {/* Main View Container */}
      <main className={`max-w-7xl mx-auto pt-2 pb-20 md:pb-8 ${currentTab === 'cart' || currentTab === 'checkout' ? 'px-[10px]' : 'px-4 sm:px-6 lg:px-8'}`}>
        <ErrorBoundary>
          <React.Suspense fallback={<ViewSuspenseFallback />}>
            {renderContent()}
          </React.Suspense>
        </ErrorBoundary>
      </main>

      {/* Food Customization Modal for Customer */}
      {selectedFoodItem && (
        <FoodDetailModal
          item={selectedFoodItem}
          onClose={() => setSelectedFoodItem(null)}
          onAddToCart={(item, qty, customizations, addons, instructions) => {
            addToCart(item, qty, customizations, addons, instructions);
            setSelectedFoodItem(null);
          }}
        />
      )}

      {/* Floating Bottom Live Order Strip & Cart Bar Container (Cleanly Stacked) */}
      {currentRole === 'CUSTOMER' &&
        currentTab !== 'cart' &&
        currentTab !== 'checkout' &&
        !trackingOrderId &&
        !isCheckoutFlow &&
        !isAddressSelection &&
        !isAddressModalOpen && (
          <div className="fixed bottom-16 md:bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-xl z-50 pointer-events-none flex flex-col gap-2.5">
            <FloatingLiveOrderBar
              onOpenTracking={handleOpenTracking}
              isTrackingOpen={!!trackingOrderId}
            />
            <FloatingCartBar onNavigateToCart={() => setCurrentTab('cart')} />
          </div>
        )}

      {/* Mobile Bottom Navigation */}
      {!(currentRole === 'CUSTOMER' && (isAddressSelection || isCheckoutFlow || trackingOrderId)) && (
        <BottomNav
          currentTab={currentTab}
          onTabChange={(tab) => {
            handleCloseTracking(true);
            setCurrentTab(tab);
          }}
        />
      )}
    </div>
  );
}
