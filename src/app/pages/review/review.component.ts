import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ReviewQueueService, ReviewFile } from '../../core/services/review-queue.service';
import { AiService } from '../../core/services/ai.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './review.component.html',
  styleUrls: ['./review.component.scss']
})
export class ReviewComponent implements OnInit, OnDestroy {
  files: ReviewFile[] = [];
  selectedIndex = 0;
  previewUrl: SafeResourceUrl | null = null;
  private rawUrl: string | null = null;
  private sub!: Subscription;

  profiles: any[] = [];
  loadingProfiles = false;

  constructor(
    private reviewQueue: ReviewQueueService,
    private aiService: AiService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.sub = this.reviewQueue.files$.subscribe(files => {
      this.files = files;
      if (this.selectedIndex >= files.length) {
        this.selectedIndex = Math.max(0, files.length - 1);
      }
    });
    this.loadProfiles();
    if (this.files.length > 0) this.loadPreview();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.revokeUrl();
  }

  loadProfiles() {
    this.loadingProfiles = true;
    this.aiService.getProfiles().subscribe({
      next: (res) => { this.profiles = res.data || []; this.loadingProfiles = false; },
      error: () => { this.loadingProfiles = false; }
    });
  }

  get current(): ReviewFile | null {
    return this.files[this.selectedIndex] || null;
  }

  get pendingCount(): number {
    return this.files.filter(f => f.status === 'pending').length;
  }

  get doneCount(): number {
    return this.files.filter(f => f.status === 'done').length;
  }

  selectFile(index: number) {
    this.selectedIndex = index;
    this.loadPreview();
  }

  loadPreview() {
    this.revokeUrl();
    const file = this.current;
    if (!file) { this.previewUrl = null; return; }
    this.rawUrl = URL.createObjectURL(file.file);
    this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.rawUrl);
  }

  private revokeUrl() {
    if (this.rawUrl) { URL.revokeObjectURL(this.rawUrl); this.rawUrl = null; }
  }

  isImage(name: string): boolean {
    return !name.toLowerCase().endsWith('.pdf');
  }

  selectProfile(templateId: number) {
    const p = this.profiles.find((pr: any) => pr.templateId === templateId);
    this.reviewQueue.update(this.selectedIndex, {
      selectedTemplateId: templateId,
      selectedTemplateName: p ? p.templateName : ''
    });
  }

  getConfidencePercent(c: number): number { return Math.round((c || 0) * 100); }

  getConfidenceClass(c: number): string {
    if (c >= 0.7) return 'success';
    if (c >= 0.4) return 'warning';
    return 'danger';
  }

  async confirmAndProcess() {
    const file = this.current;
    if (!file) return;

    const idx = this.selectedIndex;
    this.reviewQueue.update(idx, { status: 'processing' });

    try {
      await this.aiService.sendToPending(file.file).toPromise();
      this.reviewQueue.update(idx, { status: 'done' });
    } catch (err: any) {
      this.reviewQueue.update(idx, { status: 'error' });
    }

    // Auto-select next pending
    const nextPending = this.files.findIndex((f, i) => i !== idx && f.status === 'pending');
    if (nextPending >= 0) {
      this.selectFile(nextPending);
    }
  }

  getFileIcon(name: string): string {
    return name.toLowerCase().endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file-image';
  }
}
