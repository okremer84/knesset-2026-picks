import React from 'react';
import { createRoot } from 'react-dom/client';
import { SurveyComparator } from '../../src/components/SurveyComparator';
import feed from '../../data/election-results.json';
import type { Survey } from '../../src/types';
import '../../src/index.css';

const surveys = feed.surveys as Survey[];
const picks = new URLSearchParams(location.search).has('compare') ? [{ id: 'preview', pickName: 'תחזית לדוגמה', seats: surveys[0].seats }] : [];
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1200, margin: 'auto', padding: '24px 16px' }}><SurveyComparator surveys={surveys} picks={picks}/></main>);
