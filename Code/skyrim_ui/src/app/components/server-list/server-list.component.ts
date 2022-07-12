import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Output, ViewEncapsulation } from '@angular/core';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { faStar as fasStar } from '@fortawesome/free-solid-svg-icons';
import { loadingFor } from '@ngneat/loadoff';
import { FormControl } from '@ngneat/reactive-forms';
import { BehaviorSubject, combineLatestWith, Observable, ReplaySubject, share, throttleTime } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { Server } from '../../models/server';
import { ClientService } from '../../services/client.service';
import { ErrorService } from '../../services/error.service';
import { ServerListService } from '../../services/server-list.service';
import { Sound, SoundService } from '../../services/sound.service';
import { StoreService } from '../../services/store.service';
import { RootView } from '../root/root.component';


@Component({
  selector: 'app-server-list',
  templateUrl: './server-list.component.html',
  styleUrls: ['./server-list.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerListComponent {

  /* ### ICONS ### */
  readonly fasStar = fasStar;
  readonly farStar = farStar;

  loader = loadingFor('serverlist');
  refreshServerlist = new BehaviorSubject<void>(undefined);
  sortFunction = new BehaviorSubject<(a: Server, b: Server) => number>(undefined);
  favoriteServers = new BehaviorSubject<Record<string, Server>>({});
  isIncreasingPlayerOrder = new BehaviorSubject<boolean | null>(null);
  isIncreasingCountryOrder = new BehaviorSubject<boolean | null>(null);
  isIncreasingNameOrder = new BehaviorSubject<boolean | null>(null);
  isIncreasingFavoriteOrder = new BehaviorSubject<boolean | null>(null);
  serverlist$: Observable<(Server & { isCompatible: boolean; shortVersion: string })[]>;
  filteredServerlist$: typeof this.serverlist$;
  clientVersion$: Observable<string>;

  formSearch = new FormControl<string>('');

  @Output() public done = new EventEmitter<void>();
  @Output() public setView = new EventEmitter<RootView>();

  constructor(
    private errorService: ErrorService,
    private serverListService: ServerListService,
    private clientService: ClientService,
    private soundService: SoundService,
    private storeService: StoreService,
  ) {
    this.serverlist$ = this.refreshServerlist
      .pipe(
        switchMap(() => this.serverListService
          .getServerList()
          .pipe(
            /**
             * Removed due performance and ratelimit issue
             *
             * Temp fix
             * https://github.com/tiltedphoques/TiltedEvolution/pull/226
             *
             * Long term fix
             * https://github.com/tiltedphoques/TiltedEvolution/issues/247
             */
            //switchMap((list) => forkJoin(this.getLocationDataByIp(list))),
            this.loader.serverlist.track(),
          ),
        ),
        combineLatestWith(this.favoriteServers),
        map(([servers, favorites]) => {
          const clientVersion = this.clientService.versionSet.getValue();
          return servers.map(server => {
            const shortVersion = this.getServerVersion(server);
            return {
              ...server,
              isFavorite: !!favorites[`${ server.ip }:${ server.port }`],
              shortVersion,
              isCompatible: shortVersion === clientVersion,
            };
          });
        }),
        share({ connector: () => new ReplaySubject(1), resetOnRefCountZero: true }),
      );

    this.filteredServerlist$ = this.serverlist$
      .pipe(
        combineLatestWith(
          this.formSearch.value$.pipe(
            map(searchPhrase => searchPhrase?.toLowerCase()),
            distinctUntilChanged(),
            throttleTime(300),
          ),
          this.sortFunction,
        ),
        map(([servers, searchPhrase, sortFunction]) => {
          if (searchPhrase) {
            servers = servers.filter((server: Server) => {
              return server.name.toLowerCase().includes(searchPhrase) || server.desc.toLowerCase().includes(searchPhrase);
            });
          }
          if (sortFunction) {
            servers = [...servers].sort(sortFunction);
          }
          return servers;
        }),
        share({ connector: () => new ReplaySubject(1), resetOnRefCountZero: true }),
      );

    this.clientVersion$ = this.clientService.versionSet.pipe(map(version => version.split('-')[0]));

    // load favorite servers
    const favoriteServerList = JSON.parse(this.storeService.get('favoriteServerList', '[]'));
    const favoriteServers: Record<string, Server> = {};
    for (const favoriteServer of favoriteServerList) {
      favoriteServers[`${ favoriteServer.ip }:${ favoriteServer.port }`] = favoriteServer;
    }
    this.favoriteServers.next(favoriteServers);
  }

  public cancel(): void {
    this.setView.next(RootView.CONNECT);
  }

  async updateServerList() {
    this.refreshServerlist.next();
  }

  private getLocationDataByIp(servers: Server[]): Array<Observable<Server>> {
    return servers.map((server) => {
      return this.serverListService.getInformationForIp(server.ip).pipe(
        map((data) => ({ ...server, countryCode: data.countryCode.toLowerCase(), continent: data.continent, country: data.country })),
      );
    });
  }

  async saveFavoriteServerList() {
    const favorites = Object.values(this.favoriteServers.getValue());
    this.storeService.set('favoriteServerList', JSON.stringify(favorites));
  }

  async toggleServerFavorite(server: Server) {
    let favorites = this.favoriteServers.getValue();
    favorites = { ...favorites };
    if (favorites[`${ server.ip }:${ server.port }`]) {
      delete favorites[`${ server.ip }:${ server.port }`];
    } else {
      favorites[`${ server.ip }:${ server.port }`] = { ...server };
    }
    this.favoriteServers.next(favorites);

    server.isFavorite = !server.isFavorite;
    await this.saveFavoriteServerList();
  }

  public sortPlayerCount(isIncreasingOrder: boolean) {
    let sort = null;
    if (isIncreasingOrder === true) {
      sort = ServerListComponent.sortIncreasingPlayerCount;
    } else if (isIncreasingOrder === false) {
      sort = ServerListComponent.sortDescendingPlayerCount;
    }
    this.sortFunction.next(sort);
    this.isIncreasingPlayerOrder.next(isIncreasingOrder);
    this.isIncreasingCountryOrder.next(null);
    this.isIncreasingNameOrder.next(null);
    this.isIncreasingFavoriteOrder.next(null);
  }

  public sortCountry(isIncreasingCountryOrder: boolean) {
    let sort = null;
    if (isIncreasingCountryOrder === true) {
      sort = ServerListComponent.sortIncreasingCountry;
    } else if (isIncreasingCountryOrder === false) {
      sort = ServerListComponent.sortDescendingCountry;
    }
    this.sortFunction.next(sort);
    this.isIncreasingPlayerOrder.next(null);
    this.isIncreasingCountryOrder.next(isIncreasingCountryOrder);
    this.isIncreasingNameOrder.next(null);
    this.isIncreasingFavoriteOrder.next(null);
  }

  public sortName(isIncreasingNameOrder: boolean) {
    let sort = null;
    if (isIncreasingNameOrder === true) {
      sort = ServerListComponent.sortIncreasingName;
    } else if (isIncreasingNameOrder === false) {
      sort = ServerListComponent.sortDescendingName;
    }
    this.sortFunction.next(sort);
    this.isIncreasingPlayerOrder.next(null);
    this.isIncreasingCountryOrder.next(null);
    this.isIncreasingNameOrder.next(isIncreasingNameOrder);
    this.isIncreasingFavoriteOrder.next(null);
  }

  public sortFavorite(isIncreasingFavoriteOrder: boolean) {
    let sort = null;
    if (isIncreasingFavoriteOrder === true) {
      sort = ServerListComponent.sortIncreasingFavorite;
    } else if (isIncreasingFavoriteOrder === false) {
      sort = ServerListComponent.sortDescendingFavorite;
    }
    this.sortFunction.next(sort);
    this.isIncreasingPlayerOrder.next(null);
    this.isIncreasingCountryOrder.next(null);
    this.isIncreasingNameOrder.next(null);
    this.isIncreasingFavoriteOrder.next(isIncreasingFavoriteOrder);
  }

  // private filterCountryServer(search: string): void {
  //   if (search) {
  //     search = search.toLowerCase();
  //
  //     this.serverList = this.serverList.concat(this._serverList.filter((server: Server) => {
  //       return server.country.toLowerCase().includes(search);
  //     }));
  //   }
  // }

  public connect(server: Server) {
    this.clientService.connect(server.ip, server.port ? server.port : 10578);
    this.soundService.play(Sound.Ok);
    this.close();
  }

  public getServerVersion(server: Server) {
    return server.version.split('-')[0];
  }

  private close() {
    if (this.errorService.getError()) {
      this.errorService.removeError();
    } else {
      this.done.next();
    }
  }

  static sortDescendingPlayerCount(a: Server, b: Server) {
    return b.player_count - a.player_count;
  }

  static sortIncreasingPlayerCount(a: Server, b: Server) {
    return a.player_count - b.player_count;
  }

  static sortDescendingCountry(a: Server, b: Server) {
    return ServerListComponent.sortIncreasingCountry(a, b) * -1;
  }

  static sortIncreasingCountry(a: Server, b: Server) {
    if (a.country > b.country) {
      return 1;
    } else if (a.country < b.country) {
      return -1;
    }
    return 0;
  }

  static sortDescendingName(a: Server, b: Server) {
    return ServerListComponent.sortIncreasingName(a, b) * -1;
  }

  static sortIncreasingName(a: Server, b: Server) {
    return a.name.localeCompare(b.name);
  }

  static sortDescendingFavorite(a: Server, b: Server) {
    return ServerListComponent.sortIncreasingFavorite(a, b) * -1;
  }

  static sortIncreasingFavorite(a: Server, b: Server) {
    return (b.isFavorite === a.isFavorite) ? 0 : b.isFavorite ? -1 : 1;
  }

  @HostListener('window:keydown.escape', ['$event'])
  // @ts-ignore
  private activate(event: KeyboardEvent): void {
    this.close();
    event.stopPropagation();
    event.preventDefault();
  }
}
