class MarketsConfig < ApplicationConfig
  attr_config \
    api_url: "https://query1.finance.yahoo.com/v8/finance/chart",
    user_agent: "Mozilla/5.0",
    open_timeout: 5,
    read_timeout: 5,
    cache_ttl: 60,
    symbols: {
      indices: %w[^GSPC ^IXIC ^DJI ^FTSE ^GDAXI ^N225],
      forex:   %w[EURUSD=X GBPUSD=X USDJPY=X USDCNY=X],
      commodities: %w[GC=F CL=F],
    },
    available: {
      indices: %w[
        ^GSPC ^IXIC ^DJI ^FTSE ^GDAXI ^N225
        ^FCHI ^STOXX50E ^HSI ^BSESN ^BVSP
        ^RUT ^GSPTSE ^KS11 ^TWII ^STI
        ^AXJO ^NZ50 ^JKSE ^MXX ^TA125.TA
      ],
      forex: %w[
        EURUSD=X GBPUSD=X USDJPY=X USDCNY=X
        AUDUSD=X NZDUSD=X USDCAD=X USDCHF=X
        EURGBP=X EURJPY=X GBPJPY=X USDMXN=X
        USDBRL=X USDINR=X USDTRY=X USDRUB=X
        USDPLN=X USDSEK=X USDNOK=X USDSGD=X
      ],
      commodities: %w[
        GC=F SI=F CL=F BZ=F
        HG=F PL=F PA=F NG=F
        ZC=F ZW=F ZS=F KC=F
        CT=F SB=F CC=F LBS=F
      ],
    },
    labels: {
      "^GSPC"     => "S&P 500",
      "^IXIC"     => "Nasdaq",
      "^DJI"      => "Dow Jones",
      "^FTSE"     => "FTSE 100",
      "^GDAXI"    => "DAX",
      "^N225"     => "Nikkei 225",
      "^FCHI"     => "CAC 40",
      "^STOXX50E" => "Euro Stoxx 50",
      "^HSI"      => "Hang Seng",
      "^BSESN"    => "BSE Sensex",
      "^BVSP"     => "Bovespa",
      "^RUT"      => "Russell 2000",
      "^GSPTSE"   => "S&P/TSX",
      "^KS11"     => "KOSPI",
      "^TWII"     => "TAIEX",
      "^STI"      => "STI Singapore",
      "^AXJO"     => "ASX 200",
      "^NZ50"     => "NZX 50",
      "^JKSE"     => "Jakarta",
      "^MXX"      => "IPC Mexico",
      "^TA125.TA" => "TA-125",
      "EURUSD=X"  => "EUR/USD",
      "GBPUSD=X"  => "GBP/USD",
      "USDJPY=X"  => "USD/JPY",
      "USDCNY=X"  => "USD/CNY",
      "AUDUSD=X"  => "AUD/USD",
      "NZDUSD=X"  => "NZD/USD",
      "USDCAD=X"  => "USD/CAD",
      "USDCHF=X"  => "USD/CHF",
      "EURGBP=X"  => "EUR/GBP",
      "EURJPY=X"  => "EUR/JPY",
      "GBPJPY=X"  => "GBP/JPY",
      "USDMXN=X"  => "USD/MXN",
      "USDBRL=X"  => "USD/BRL",
      "USDINR=X"  => "USD/INR",
      "USDTRY=X"  => "USD/TRY",
      "USDRUB=X"  => "USD/RUB",
      "USDPLN=X"  => "USD/PLN",
      "USDSEK=X"  => "USD/SEK",
      "USDNOK=X"  => "USD/NOK",
      "USDSGD=X"  => "USD/SGD",
      "GC=F"      => "Gold",
      "SI=F"      => "Silver",
      "CL=F"      => "Crude Oil WTI",
      "BZ=F"      => "Brent",
      "HG=F"      => "Copper",
      "PL=F"      => "Platinum",
      "PA=F"      => "Palladium",
      "NG=F"      => "Natural Gas",
      "ZC=F"      => "Corn",
      "ZW=F"      => "Wheat",
      "ZS=F"      => "Soybeans",
      "KC=F"      => "Coffee",
      "CT=F"      => "Cotton",
      "SB=F"      => "Sugar",
      "CC=F"      => "Cocoa",
      "LBS=F"     => "Lumber",
    }
end
