"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import styles from "./dashboard.module.css";

interface SpendingChartProps {
  data: any[];
}

export default function SpendingChart({ data }: SpendingChartProps) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  const getPercentage = (value: number) => {
    if (total === 0) return 0;
    return parseFloat(((Number(value) / total) * 100).toFixed(1));
  };

  return (
    <div className={styles.chartCard}>
      <h3>Spending this Month</h3>
      <div className={styles.donutWrapper}>
        <div style={{ width: 140, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry: any, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [`${getPercentage(value)}%`, 'Share']}
                contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className={styles.donutLegend}>
          {data.map((item: any, index) => (
            <div key={index} className={styles.legendItem}>
              <div className={styles.legendLabel}>
                <div 
                  className={styles.legendDot} 
                  style={{ background: item.color }} 
                />
                {item.name}
              </div>
              <div className={styles.legendValue}>{getPercentage(item.value)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
