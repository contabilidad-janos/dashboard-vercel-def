import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Header from './components/Header';
import Tabs from './components/Tabs';
import Dashboard2026 from './components/Dashboard2026';
import Dashboard2025 from './components/Dashboard2025';
import Dashboard2024 from './components/Dashboard2024';
import DashboardDetails from './components/DashboardDetails';
import CanEscarrerDashboard from './components/CanEscarrerDashboard';

// Register ChartJS components globally
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels
);

function App() {
  const [activeTab, setActiveTab] = useState('2026');

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-screen bg-background text-gray-800">
      {/* Toast Placeholder */}
      <div id="toast" className="fixed bottom-4 right-4 bg-primary text-white px-6 py-3 rounded-lg shadow-lg translate-y-20 opacity-0 transition-all duration-300 z-50 font-medium pointer-events-none">
        Notification Message
      </div>

      <Header />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

      <main>
        {activeTab === '2026' && (
          <div id="page-2026" className="animate-in fade-in duration-500">
            <Dashboard2026 />
          </div>
        )}

        {activeTab === '2025' && (
          <div id="page-2025" className="animate-in fade-in duration-500">
            <Dashboard2025 />
          </div>
        )}

        {activeTab === '2024' && (
          <div id="page-2024" className="animate-in fade-in duration-500">
            <Dashboard2024 />
          </div>
        )}

        {activeTab === 'details' && (
          <div id="page-details" className="animate-in fade-in duration-500">
            <DashboardDetails />
          </div>
        )}

        {activeTab === 'can-escarrer' && (
          <div id="page-can-escarrer" className="animate-in fade-in duration-500">
            <CanEscarrerDashboard />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
