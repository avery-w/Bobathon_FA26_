'use client';

import React from 'react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { Database, AlertTriangle, Scale, Clock } from 'lucide-react';

export const ExecutiveKPIBar = () => {
  const { isHistoricalReplay } = useTimeMachineStore();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '16px' }}>
      {/* KPI 1 */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#0F172A',
          borderRadius: '12px',
          border: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', textTransform: 'uppercase', display: 'block' }}>
            Decisions Tracked
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#FFFFFF' }}>1,428</span>
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(30, 58, 138, 0.4)', border: '1px solid #1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60A5FA' }}>
          <Database style={{ width: '16px', height: '16px' }} />
        </div>
      </div>

      {/* KPI 2 - The Hero Trigger */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: '12px',
          border: isHistoricalReplay ? '1px solid #1E293B' : '2px solid rgba(239, 68, 68, 0.8)',
          backgroundColor: isHistoricalReplay ? '#0F172A' : 'rgba(69, 10, 10, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.3s ease',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#F87171', textTransform: 'uppercase', display: 'block' }}>
            Drift Alerts
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isHistoricalReplay ? '0' : '1 CRITICAL'}
            {!isHistoricalReplay && <span style={{ fontSize: '12px', color: '#F87171', fontWeight: 'bold' }}>($1.4M)</span>}
          </span>
        </div>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isHistoricalReplay ? '#1E293B' : '#7F1D1D',
            color: isHistoricalReplay ? '#64748B' : '#FCA5A5',
          }}
        >
          <AlertTriangle style={{ width: '16px', height: '16px' }} />
        </div>
      </div>

      {/* KPI 3 */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#0F172A',
          borderRadius: '12px',
          border: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', textTransform: 'uppercase', display: 'block' }}>
            Active Reviews
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#FFFFFF' }}>1 Scheduled</span>
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(88, 28, 135, 0.4)', border: '1px solid #7E22CE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C084FC' }}>
          <Scale style={{ width: '16px', height: '16px' }} />
        </div>
      </div>

      {/* KPI 4 */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#0F172A',
          borderRadius: '12px',
          border: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8', textTransform: 'uppercase', display: 'block' }}>
            Oldest Unreviewed
          </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', color: '#FFFFFF' }}>448 Days</span>
        </div>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(120, 53, 15, 0.4)', border: '1px solid #B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBBF24' }}>
          <Clock style={{ width: '16px', height: '16px' }} />
        </div>
      </div>
    </div>
  );
};
