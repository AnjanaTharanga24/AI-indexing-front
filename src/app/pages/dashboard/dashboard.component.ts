import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AiService } from '../../core/services/ai.service';

interface ProfileInfo {
  templateId: number;
  templateName: string;
  summary: string;
  model: string;
  version: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  totalTemplates = 0;
  profiledTemplates = 0;
  profilePercentage = 0;
  aiModel = '';

  profiles: ProfileInfo[] = [];
  loading = true;
  error = '';

  constructor(private aiService: AiService) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;
    this.error = '';

    let templatesLoaded = false;
    let profilesLoaded = false;

    this.aiService.getTemplates().subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.totalTemplates = res.data.length;
        }
        templatesLoaded = true;
        if (profilesLoaded) this.finalize();
      },
      error: () => {
        templatesLoaded = true;
        if (profilesLoaded) this.finalize();
      }
    });

    this.aiService.getProfiles().subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.profiles = res.data;
          this.profiledTemplates = this.profiles.length;
          if (this.profiles.length > 0 && this.profiles[0].model) {
            this.aiModel = this.profiles[0].model;
          }
        }
        profilesLoaded = true;
        if (templatesLoaded) this.finalize();
      },
      error: (err: any) => {
        this.error = 'Failed to load profiles';
        profilesLoaded = true;
        if (templatesLoaded) this.finalize();
      }
    });
  }

  private finalize(): void {
    this.profilePercentage = this.totalTemplates > 0
      ? Math.round((this.profiledTemplates / this.totalTemplates) * 100)
      : 0;
    this.loading = false;
  }

  get unprofiled(): number {
    return Math.max(0, this.totalTemplates - this.profiledTemplates);
  }
}
