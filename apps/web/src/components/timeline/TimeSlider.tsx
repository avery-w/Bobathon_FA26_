'use client';

import React from 'react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { History } from 'lucide-react';

export const TimeSlider = () => {
  const { sliderIndex, setSliderIndex, currentEpoch, isHistoricalReplay, resetTo2024, resetToPresent } = useTimeMachineStore();

  return (
    <div
      style={{
        width: '100%',
        padding: '16px 20px',
        borderRadius: '16px',
        border: isHistoricalReplay ? '2px solid rgba(245, 158, 11, 0.6)' : '1px solid #1E293B',
        backgroundColor: isHistoricalReplay ? 'rgba(69, 26, 3, 0.4)' : '#0F172A',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
        transition: 'all 0.3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History style={{ width: '20px', height: '20px', color: isHistoricalReplay ? '#FBBF24' : '#60A5FA' }} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#E2E8F0' }}>
            {isHistoricalReplay ? '🕰️ Historical Replay Mode (Zero Hindsight)' : '⚡ Present Day System State'}
          </span>
        </div>

        {/* Quick Jump Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={resetTo2024}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontFamily: 'monospace',
              borderRadius: '8px',
              border: sliderIndex === 1 ? '1px solid #F59E0B' : '1px solid #334155',
              backgroundColor: sliderIndex === 1 ? '#F59E0B' : '#1E293B',
              color: sliderIndex === 1 ? '#000000' : '#CBD5E1',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Dec 12, 2024 (ADR Vote)
          </button>
          <button
            onClick={resetToPresent}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontFamily: 'monospace',
              borderRadius: '8px',
              border: sliderIndex === 2 ? '1px solid #3B82F6' : '1px solid #334155',
              backgroundColor: sliderIndex === 2 ? '#2563EB' : '#1E293B',
              color: '#FFFFFF',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Today (Mar 2026 Live Drift)
          </button>
        </div>
      </div>

      {/* Slider Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B' }}>Nov 2024</span>
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={sliderIndex}
          onChange={(e) => setSliderIndex(parseInt(e.target.value))}
          style={{ width: '100%', height: '8px', cursor: 'pointer', accentColor: isHistoricalReplay ? '#F59E0B' : '#3B82F6' }}
        />
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B' }}>Mar 2026 (Today)</span>
      </div>

      {/* Epoch Display & Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', fontFamily: 'monospace' }}>
        <span style={{ color: '#94A3B8' }}>
          Scrubbed Epoch: <strong style={{ color: '#FFFFFF', fontSize: '13px' }}>{currentEpoch}</strong>
        </span>
        {isHistoricalReplay ? (
          <span style={{ color: '#FBBF24', fontWeight: 'bold' }}>
            ⚠️ 2026 Outages & Bulletins Purged from Context
          </span>
        ) : (
          <span style={{ color: '#F87171', fontWeight: 'bold' }}>
            🚨 2026 Live Drift Active ($1.4M Exposure)
          </span>
        )}
      </div>
    </div>
  );
};
