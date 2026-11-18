import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ReviewFile {
  file: File;
  name: string;
  size: string;
  confidence: number;
  selectedTemplateId?: number;
  selectedTemplateName?: string;
  classifyResult?: any;
  classifyError?: string;
  extractResult?: any;
  status: 'pending' | 'processing' | 'done' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ReviewQueueService {
  private queue$ = new BehaviorSubject<ReviewFile[]>([]);
  readonly files$ = this.queue$.asObservable();

  get files(): ReviewFile[] { return this.queue$.value; }
  get count(): number { return this.queue$.value.filter(f => f.status === 'pending').length; }

  add(file: ReviewFile) {
    const current = this.queue$.value;
    const exists = current.some(f => f.name === file.name && f.size === file.size);
    if (!exists) {
      this.queue$.next([...current, file]);
    }
  }

  addMany(files: ReviewFile[]) {
    files.forEach(f => this.add(f));
  }

  update(index: number, partial: Partial<ReviewFile>) {
    const current = [...this.queue$.value];
    if (current[index]) {
      current[index] = { ...current[index], ...partial };
      this.queue$.next(current);
    }
  }

  remove(index: number) {
    const current = [...this.queue$.value];
    current.splice(index, 1);
    this.queue$.next(current);
  }

  clear() {
    this.queue$.next([]);
  }
}
