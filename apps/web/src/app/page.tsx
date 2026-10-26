'use client';

import React from 'react';
import { TopBar } from '@/components/navigation/TopBar';
import { TimeSlider } from '@/components/timeline/TimeSlider';
import { DecisionGraph } from '@/components/canvas/DecisionGraph';
import { DriftPanel } from '@/components/drift/DriftPanel';
import { ExecutiveKPIBar } from '@/components/dashboard/ExecutiveKPIBar';

export default function TemporalCockpitPage() {
  return (
    <div style={{ minHeight: '100vh', width: '100%', backgroundColor: '#06080F', color: '#FFFFFF', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Universal Top Navigation */}
      <TopBar />

      {/* Main Temporal Cockpit */}
      <main style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1720px', width: '100%', margin: '0 auto' }}>
        {/* Executive KPI Bar */}
        <ExecutiveKPIBar />

        {/* Historical Scrubber */}
        <TimeSlider />

        {/* 60 / 40 Split Workspace */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '20px', minHeight: '560px' }}>
          {/* Causal Decision Graph (60%) */}
          <div style={{ height: '100%', minHeight: '560px' }}>
            <DecisionGraph />
          </div>

          {/* Decision Drift & Evidence Panel (40%) */}
          <div style={{ height: '100%', minHeight: '560px' }}>
            <DriftPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
