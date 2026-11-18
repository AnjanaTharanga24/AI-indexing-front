import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';

@Component({
  selector: 'app-profiles',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './profiles.component.html',
  styleUrls: ['./profiles.component.scss']
})
export class ProfilesComponent implements OnInit {
  profiles: any[] = [];
  loading = true;
  error = '';
  searchText = '';
  viewMode: 'grid' | 'list' = 'grid';
  expandedId: number | null = null;

  constructor(private aiService: AiService) {}

  ngOnInit() {
    this.loadProfiles();
  }

  loadProfiles() {
    this.loading = true;
    this.error = '';
    this.aiService.getProfiles().subscribe({
      next: (res) => {
        this.profiles = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load profiles';
        this.loading = false;
      }
    });
  }

  get filteredProfiles(): any[] {
    if (!this.searchText.trim()) return this.profiles;
    const q = this.searchText.toLowerCase();
    return this.profiles.filter((p: any) =>
      (p.templateName || '').toLowerCase().includes(q) ||
      (p.summary || '').toLowerCase().includes(q)
    );
  }

  getFeatures(profile: any): string[] {
    const features = profile.identifyingFeatures;
    if (!features) return [];
    if (Array.isArray(features)) return features;
    return String(features).split(',').map((f: string) => f.trim()).filter(Boolean);
  }

  getAlternativeNames(profile: any): string[] {
    const names = profile.alternativeNames;
    if (!names) return [];
    if (Array.isArray(names)) return names;
    return String(names).split(',').map((n: string) => n.trim()).filter(Boolean);
  }

  getDistinguishingFeatures(profile: any): string[] {
    const features = profile.distinguishingFeatures;
    if (!features) return [];
    if (Array.isArray(features)) return features;
    return String(features).split(',').map((f: string) => f.trim()).filter(Boolean);
  }

  getProfileIcon(name: string): string {
    if (!name) return 'file';
    const n = name.toLowerCase();
    if (n.includes('invoice')) return 'file-invoice';
    if (n.includes('purchase') || n.includes('order')) return 'cart-shopping';
    if (n.includes('receipt')) return 'receipt';
    if (n.includes('national') || n.includes('nic') || n.includes('id card')) return 'id-card';
    if (n.includes('driv') || n.includes('license') || n.includes('licence')) return 'car';
    if (n.includes('birth')) return 'baby';
    if (n.includes('bank') || n.includes('statement')) return 'building-columns';
    if (n.includes('tax')) return 'landmark';
    if (n.includes('passport')) return 'passport';
    if (n.includes('insurance')) return 'shield-halved';
    if (n.includes('medical') || n.includes('health')) return 'file-medical';
    return 'file';
  }

  toggleExpand(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  getCardAccent(name: string): string {
    if (!name) return '#6B7280';
    const n = name.toLowerCase();
    if (n.includes('invoice')) return '#4F5FE8';
    if (n.includes('purchase') || n.includes('order')) return '#8B5CF6';
    if (n.includes('receipt')) return '#22A559';
    if (n.includes('national') || n.includes('nic') || n.includes('id card')) return '#3B82F6';
    if (n.includes('driv') || n.includes('license') || n.includes('licence')) return '#0EA5E9';
    if (n.includes('birth')) return '#F4A31E';
    if (n.includes('bank') || n.includes('statement')) return '#6B7280';
    if (n.includes('tax')) return '#DC2626';
    if (n.includes('passport')) return '#4F46E5';
    if (n.includes('insurance')) return '#06B6D4';
    if (n.includes('medical') || n.includes('health')) return '#EC4899';
    return '#6B7280';
  }
}
