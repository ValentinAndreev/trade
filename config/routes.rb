Rails.application.routes.draw do
  get 'up' => 'rails/health#show', as: :rails_health_check

  namespace :api do
    resources :candles, only: :index
    resources :indicators, only: :index
    get 'indicators/:type', to: 'indicators#show', as: :indicator
  end

  resources :charts, only: :show
  root 'charts#show'
end
