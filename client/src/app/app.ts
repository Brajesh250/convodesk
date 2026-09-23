import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component. For now it only hosts the router outlet;
 * the authenticated shell (toolbar + side nav) arrives in Phase 4.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="placeholder">
      <h1>ConvoDesk</h1>
      <p>AI inbox + mini-CRM. The app shell lands in Phase 4.</p>
    </main>
    <router-outlet />
  `,
  styles: `
    .placeholder {
      font-family: system-ui, sans-serif;
      max-width: 40rem;
      margin: 4rem auto;
      padding: 0 1rem;
    }
  `,
})
export class App {}
