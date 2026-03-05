Rails.application.routes.draw do
  get 'up' => 'rails/health#show', as: :rails_health_check

  namespace :api do
    get "health", to: "health#show"

    # Auth
    resource :session, only: %i[show create destroy]
    resource :registration, only: :create

    # Presets
    resources :presets, only: %i[index show create update destroy] do
      collection do
        get :state
        post :apply_state
        post :reset_state
      end
    end

    resource :configs, only: :show
    resources :candles, only: :index
    resources :tickers, only: :index
    resource :dashboard, only: [] do
      post :add
      post :remove
    end
    resources :markets, only: :index do
      collection do
        post :add
        post :remove
      end
    end
    resources :indicators, only: :index
    post 'indicators/:type/compute', to: 'indicators#compute'
  end

  resources :charts, only: :show
  root 'charts#show'
end
